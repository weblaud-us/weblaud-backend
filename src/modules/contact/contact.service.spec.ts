import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ContactService } from './contact.service';
import { Contact } from './schemas/contact.schema';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { LeadReplyService } from '../leads/lead-reply.service';

const VALID_DTO = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+8801700000000',
  message: 'Hello there',
};

describe('ContactService', () => {
  let service: ContactService;
  let model: {
    create: jest.Mock;
    exists: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let notifier: { notifyNew: jest.Mock };
  let leadReply: { sendContactConfirmation: jest.Mock };

  const notified = () => notifier.notifyNew.mock.calls[0][0];

  beforeEach(async () => {
    model = {
      create: jest.fn().mockImplementation((doc) => ({ _id: 'abc', ...doc })),
      exists: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    notifier = { notifyNew: jest.fn().mockResolvedValue(undefined) };
    leadReply = { sendContactConfirmation: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: getModelToken(Contact.name), useValue: model },
        { provide: DashboardNotifierService, useValue: notifier },
        { provide: LeadReplyService, useValue: leadReply },
      ],
    }).compile();

    service = module.get(ContactService);
  });

  it('persists the submission and answers with a generic acknowledgement', async () => {
    await expect(service.submit(VALID_DTO)).resolves.toEqual({
      received: true,
    });
    expect(model.create).toHaveBeenCalledWith(VALID_DTO);
  });

  it('notifies the dashboard with the message details', async () => {
    await service.submit(VALID_DTO);

    expect(notified()).toEqual(
      expect.objectContaining({
        kind: 'contact message',
        dashboardPath: '/contact-submissions',
        recordId: 'abc',
      }),
    );
    expect(notified().rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Name', value: 'Ada Lovelace' }),
        expect.objectContaining({
          label: 'Email',
          value: 'ada@example.com',
          href: 'mailto:ada@example.com',
        }),
        expect.objectContaining({ label: 'Message', value: 'Hello there' }),
      ]),
    );
  });

  it('leaves the phone row unlinked when no phone was given', async () => {
    await service.submit({ ...VALID_DTO, phone: undefined });

    const phone = notified().rows.find(
      (r: { label: string }) => r.label === 'Phone',
    );
    // The notifier drops empty rows, so an undefined value is safe to pass —
    // but the href must not become "tel:undefined".
    expect(phone.href).toBeUndefined();
  });

  // See dashboard-notifier.service.spec.ts for the "notification failure never
  // loses the record" half of the guarantee.
  it('persists the submission before attempting to notify', async () => {
    await service.submit(VALID_DTO);

    expect(model.create.mock.invocationCallOrder[0]).toBeLessThan(
      notifier.notifyNew.mock.invocationCallOrder[0],
    );
  });

  describe('spam handling', () => {
    it('stores a link-stuffed message as spam and sends no notification', async () => {
      const result = await service.submit({
        ...VALID_DTO,
        message:
          'Boost your rankings https://seo.example.com and https://links.example.com',
      });

      expect(result).toEqual({ received: true });
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'spam' }),
      );
      expect(notifier.notifyNew).not.toHaveBeenCalled();
      expect(leadReply.sendContactConfirmation).not.toHaveBeenCalled();
    });

    it('drops an exact duplicate from the same address without storing or notifying', async () => {
      model.exists.mockResolvedValue({ _id: 'earlier' });

      await expect(service.submit(VALID_DTO)).resolves.toEqual({
        received: true,
      });
      expect(model.create).not.toHaveBeenCalled();
      expect(notifier.notifyNew).not.toHaveBeenCalled();
      expect(leadReply.sendContactConfirmation).not.toHaveBeenCalled();
    });

    it('sends the withheld notification when an admin marks a message not-spam', async () => {
      model.findOneAndUpdate.mockResolvedValue({
        _id: 'abc',
        ...VALID_DTO,
        status: 'new',
      });

      await service.markNotSpam('abc');

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'abc', status: 'spam' },
        expect.objectContaining({ status: 'new' }),
        { new: true },
      );
      expect(notified()).toEqual(
        expect.objectContaining({ kind: 'contact message', recordId: 'abc' }),
      );
    });
  });

  describe('auto-reply to the lead', () => {
    it('confirms receipt to the submitter and records when it went out', async () => {
      await service.submit(VALID_DTO);

      expect(leadReply.sendContactConfirmation).toHaveBeenCalledWith(
        'ada@example.com',
        'Ada',
      );
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: 'abc' },
        { autoReplySentAt: expect.any(Date) },
      );
    });

    it('sends at most one auto-reply per address per day', async () => {
      // First exists() is the duplicate-message check, second the reply cap.
      model.exists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'earlier' });

      await service.submit(VALID_DTO);

      expect(model.create).toHaveBeenCalled();
      expect(notifier.notifyNew).toHaveBeenCalled();
      expect(leadReply.sendContactConfirmation).not.toHaveBeenCalled();
    });

    it('does not record a reply that failed to send', async () => {
      leadReply.sendContactConfirmation.mockResolvedValue(false);

      await expect(service.submit(VALID_DTO)).resolves.toEqual({
        received: true,
      });
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('still acknowledges the visitor when the reply bookkeeping throws', async () => {
      model.exists
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('db down'));

      await expect(service.submit(VALID_DTO)).resolves.toEqual({
        received: true,
      });
    });
  });

  describe('lead source', () => {
    it('stores attribution and the self-reported source with the message', async () => {
      const dto = {
        ...VALID_DTO,
        attribution: { utmSource: 'newsletter', landingPath: '/vs/x' },
        heardAbout: 'ai_assistant',
      };
      await service.submit(dto);

      expect(model.create).toHaveBeenCalledWith(dto);
      expect(notified().rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            section: 'Source',
            label: 'Heard about us',
            value: 'ChatGPT / AI assistant',
          }),
          expect.objectContaining({ label: 'Campaign', value: 'newsletter' }),
          expect.objectContaining({ label: 'Landing page', value: '/vs/x' }),
        ]),
      );
    });
  });

  describe('qualifiers', () => {
    it('stores budget and timeline and shows them by label in the alert', async () => {
      const dto = { ...VALID_DTO, budget: '10k_20k', timeline: '1_3_months' };
      await service.submit(dto);

      expect(model.create).toHaveBeenCalledWith(dto);
      expect(notified().rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Budget', value: '$10k – $20k' }),
          expect.objectContaining({
            label: 'Timeline',
            value: 'Within 1–3 months',
          }),
        ]),
      );
    });

    it('labels a current budget band in the alert', async () => {
      await service.submit({ ...VALID_DTO, budget: '50k_plus' });

      expect(notified().rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Budget', value: '$50k+' }),
        ]),
      );
    });

    it('passes empty qualifier rows (dropped by the notifier) when not given', async () => {
      await service.submit(VALID_DTO);

      const budget = notified().rows.find(
        (r: { label: string }) => r.label === 'Budget',
      );
      expect(budget.value).toBeUndefined();
    });
  });

  describe('updatePipeline', () => {
    it('applies the stage change and clears emptied fields', async () => {
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'abc' });

      await service.updatePipeline('abc', {
        stage: 'contacted',
        nextFollowUpAt: null,
      });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'abc',
        {
          $set: { stage: 'contacted' },
          $unset: { nextFollowUpAt: 1, lostReason: 1 },
        },
        { new: true },
      );
    });

    it('404s on an unknown id', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        service.updatePipeline('missing', { stage: 'won' }),
      ).rejects.toThrow('Message not found');
    });
  });
});
