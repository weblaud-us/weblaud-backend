import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ContactService } from './contact.service';
import { Contact } from './schemas/contact.schema';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';

const VALID_DTO = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+8801700000000',
  message: 'Hello there',
};

describe('ContactService', () => {
  let service: ContactService;
  let model: { create: jest.Mock };
  let notifier: { notifyNew: jest.Mock };

  const notified = () => notifier.notifyNew.mock.calls[0][0];

  beforeEach(async () => {
    model = {
      create: jest.fn().mockImplementation((doc) => ({ _id: 'abc', ...doc })),
    };
    notifier = { notifyNew: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: getModelToken(Contact.name), useValue: model },
        { provide: DashboardNotifierService, useValue: notifier },
      ],
    }).compile();

    service = module.get(ContactService);
  });

  it('persists the submission and returns it', async () => {
    await expect(service.submit(VALID_DTO)).resolves.toEqual(
      expect.objectContaining({ _id: 'abc', email: 'ada@example.com' }),
    );
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
});
