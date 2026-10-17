import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

// Same reasoning as invoice.service.spec.ts: UsersService's module
// transitively loads the real User schema, which ts-jest's isolated
// per-file compilation can't handle. Fully replaced by the useValue mock
// below, so there's no reason to load the real implementation.
jest.mock('src/modules/users/users.service', () => ({
  UsersService: class UsersService {},
}));

import { NotificationService } from './notification.service';
import { Notification } from './schemas/notification.schema';
import { MailService } from 'src/modules/mail/mail.service';
import { UsersService } from 'src/modules/users/users.service';

describe('NotificationService — email channel (Phase 5)', () => {
  let service: NotificationService;
  let model: { create: jest.Mock; countDocuments: jest.Mock };
  let mail: { sendEmail: jest.Mock };
  let users: { findOne: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    model = {
      create: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn(),
    };
    mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    users = { findOne: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'mail.unsubscribeSecret') return 'a'.repeat(32);
        if (key === 'portal.baseUrl') return 'https://portal.example.com';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getModelToken(Notification.name), useValue: model },
        { provide: MailService, useValue: mail },
        { provide: UsersService, useValue: users },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  it('always writes the in-app row, with or without an email option', async () => {
    users.findOne.mockResolvedValue(null);
    await service.notify({ user: 'u1', type: 'contract_sent', title: 'Hi' });
    expect(model.create).toHaveBeenCalledWith({
      user: 'u1',
      type: 'contract_sent',
      title: 'Hi',
    });
  });

  it('sends the email when the recipient has no opt-out for that category', async () => {
    users.findOne.mockResolvedValue({
      email: 'client@example.com',
      firstName: 'Ada',
      emailPreferences: { contracts: true },
    });

    await service.notify({
      user: 'u1',
      type: 'contract_sent',
      title: 'New contract',
      link: '/portal/contracts',
      email: {
        category: 'contracts',
        subject: 'New contract to review',
        template: 'contract-sent',
        context: { contractTitle: 'SOW' },
      },
    });

    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@example.com',
        subject: 'New contract to review',
        template: 'contract-sent',
        context: expect.objectContaining({
          contractTitle: 'SOW',
          firstName: 'Ada',
          actionUrl: 'https://portal.example.com/portal/contracts',
          unsubscribeUrl: expect.stringContaining(
            'category=contracts',
          ) as unknown,
        }) as unknown,
      }),
    );
  });

  it('skips the email entirely when the recipient opted out of that category', async () => {
    users.findOne.mockResolvedValue({
      email: 'client@example.com',
      firstName: 'Ada',
      emailPreferences: { contracts: false },
    });

    await service.notify({
      user: 'u1',
      type: 'contract_sent',
      title: 'New contract',
      email: { category: 'contracts', subject: 'x', template: 'contract-sent' },
    });

    expect(mail.sendEmail).not.toHaveBeenCalled();
    // The in-app notification still went out — an opt-out only silences email.
    expect(model.create).toHaveBeenCalled();
  });

  it('never rejects notify() when the mail transport throws', async () => {
    users.findOne.mockResolvedValue({
      email: 'client@example.com',
      firstName: 'Ada',
    });
    mail.sendEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      service.notify({
        user: 'u1',
        type: 'invoice_sent',
        title: 'x',
        email: { category: 'invoices', subject: 'x', template: 'invoice-sent' },
      }),
    ).resolves.toBeUndefined();
  });

  it('skips the email when the recipient has no email on file', async () => {
    users.findOne.mockResolvedValue({ firstName: 'Ada' });

    await service.notify({
      user: 'u1',
      type: 'invoice_sent',
      title: 'x',
      email: { category: 'invoices', subject: 'x', template: 'invoice-sent' },
    });

    expect(mail.sendEmail).not.toHaveBeenCalled();
  });
});
