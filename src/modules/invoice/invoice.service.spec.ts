import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';

// Replaced with dummy classes before InvoiceService (and therefore these
// modules) ever loads for real. ClientProjectService's module transitively
// imports UsersService, which imports the real User schema — and
// SchemaFactory.createForClass(User) throws under ts-jest's isolated,
// per-file compilation (it needs cross-file type info this test runner
// doesn't have; the real app builds fine via a full tsc program). Nothing
// under test here touches either service's actual implementation — both are
// fully replaced by the `useValue` mocks below — so there's no reason to
// pay for loading them at all.
jest.mock('src/modules/users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('src/modules/client-project/client-project.service', () => ({
  ClientProjectService: class ClientProjectService {},
}));

import { InvoiceService } from './invoice.service';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';
import {
  Payment,
  PaymentProvider,
  PaymentStatus,
} from 'src/modules/payment/schemas/payment.schema';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { UsersService } from 'src/modules/users/users.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { CounterService } from 'src/modules/counter/counter.service';
import { TimeEntry } from 'src/modules/time-entry/schemas/time-entry.schema';

/** sumSucceededPayments does `new Types.ObjectId(invoiceId)` — every id used as a method argument below has to be valid-hex-shaped, not just a placeholder string. */
const INVOICE_ID = '507f1f77bcf86cd799439011';

/**
 * A minimal stand-in for a Mongoose InvoiceDocument: mutable fields plus a
 * `save()` that resolves to the same object, which is all InvoiceService's
 * settlement paths (recordPayment/markPaid/confirmPaymentFromWebhook →
 * settleFromLedger) touch on the document itself.
 */
function makeInvoiceDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: INVOICE_ID,
    organization: 'org1',
    project: 'proj1',
    number: 'INV-2026-00001',
    status: InvoiceStatus.SENT,
    lineItems: [{ description: 'Work', qty: 1, unitPrice: 1000 }],
    subtotal: 1000,
    tax: 0,
    total: 1000,
    currency: 'USD',
    createdBy: 'user1',
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(() => Promise.resolve(doc));
  return doc;
}

describe('InvoiceService — payment ledger (Findings 1.1, 1.3, 1.5, 1.6, 1.8)', () => {
  let service: InvoiceService;
  let model: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    updateMany: jest.Mock;
    find: jest.Mock;
  };
  let paymentModel: {
    create: jest.Mock;
    aggregate: jest.Mock;
    find: jest.Mock;
  };
  let projects: { increaseBudgetSpent: jest.Mock };
  let users: {
    findClientAdmins: jest.Mock;
    findClientAdminsForOrgs: jest.Mock;
  };
  let notifications: { notifyMany: jest.Mock };
  let auditLog: { record: jest.Mock };
  let counters: { next: jest.Mock };
  let timeEntryModel: { updateMany: jest.Mock };

  /** succeeded-payment amounts recorded so far, driving the aggregate() mock — stands in for the real Payment collection. */
  let ledger: number[];

  const sortLimitLean = () => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    ledger = [];

    model = {
      create: jest
        .fn()
        .mockImplementation((doc) =>
          Promise.resolve({ _id: INVOICE_ID, ...doc }),
        ),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(sortLimitLean()),
    };

    paymentModel = {
      create: jest.fn().mockImplementation((doc) => {
        if (doc.status === PaymentStatus.SUCCEEDED) ledger.push(doc.amount);
        return Promise.resolve({ _id: `pay${ledger.length}`, ...doc });
      }),
      aggregate: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([
            { total: ledger.reduce((sum, amount) => sum + amount, 0) },
          ]),
        ),
      find: jest.fn().mockReturnValue({
        sort: jest
          .fn()
          .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      }),
    };

    projects = { increaseBudgetSpent: jest.fn().mockResolvedValue(undefined) };
    users = {
      findClientAdmins: jest.fn().mockResolvedValue([{ _id: 'admin1' }]),
      findClientAdminsForOrgs: jest.fn().mockResolvedValue(new Map()),
    };
    notifications = { notifyMany: jest.fn().mockResolvedValue(undefined) };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    counters = { next: jest.fn().mockResolvedValue(7) };
    timeEntryModel = { updateMany: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getModelToken(Invoice.name), useValue: model },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(TimeEntry.name), useValue: timeEntryModel },
        { provide: ClientProjectService, useValue: projects },
        { provide: UsersService, useValue: users },
        { provide: NotificationService, useValue: notifications },
        { provide: AuditLogService, useValue: auditLog },
        { provide: CounterService, useValue: counters },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  describe('nextNumber (Finding 1.1 — no more countDocuments()+1 collisions)', () => {
    it('numbers a new invoice from the atomic per-year counter, not a document count', async () => {
      await service.create(
        {
          organization: 'org1',
          project: 'proj1',
          lineItems: [{ description: 'A', qty: 1, unitPrice: 1000 }],
          issueDate: '2026-01-01',
          dueDate: '2026-01-15',
        } as never,
        'user1',
      );

      const year = new Date().getFullYear();
      expect(counters.next).toHaveBeenCalledWith(`invoice-${year}`);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ number: `INV-${year}-00007` }),
      );
    });
  });

  describe('update (Finding 1.3 — tax-only edit no longer leaves total stale)', () => {
    it("recomputes total when only tax changes, using the invoice's existing line items", async () => {
      const existing = makeInvoiceDoc({
        status: InvoiceStatus.DRAFT,
        lineItems: [{ description: 'A', qty: 2, unitPrice: 500 }], // subtotal 1000
        tax: 0,
        total: 1000,
      });
      model.findById.mockResolvedValue(existing);
      model.findByIdAndUpdate.mockResolvedValue({});

      await service.update(INVOICE_ID, { tax: 100 } as never);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        INVOICE_ID,
        expect.objectContaining({ tax: 100, subtotal: 1000, total: 1100 }),
        { new: true },
      );
    });

    it('still recomputes when lineItems change, same as before', async () => {
      const existing = makeInvoiceDoc({
        status: InvoiceStatus.DRAFT,
        lineItems: [{ description: 'A', qty: 1, unitPrice: 1000 }],
        tax: 50,
        total: 1050,
      });
      model.findById.mockResolvedValue(existing);
      model.findByIdAndUpdate.mockResolvedValue({});

      await service.update(INVOICE_ID, {
        lineItems: [{ description: 'B', qty: 2, unitPrice: 300 }],
      } as never);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        INVOICE_ID,
        expect.objectContaining({ subtotal: 600, tax: 50, total: 650 }),
        { new: true },
      );
    });
  });

  describe('recordPayment (Finding 1.5 — manual settlements now write a ledger row)', () => {
    it('rejects a draft invoice', async () => {
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.DRAFT }),
      );
      await expect(
        service.recordPayment(INVOICE_ID, { amount: 100 }, 'admin1'),
      ).rejects.toThrow(BadRequestException);
      expect(paymentModel.create).not.toHaveBeenCalled();
    });

    it('records a manual payment for less than the total and leaves the invoice PARTIALLY_PAID', async () => {
      const invoice = makeInvoiceDoc({
        status: InvoiceStatus.SENT,
        total: 1000,
      });
      model.findById.mockResolvedValue(invoice);

      const result = await service.recordPayment(
        INVOICE_ID,
        { amount: 400 },
        'admin1',
      );

      expect(paymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: INVOICE_ID,
          amount: 400,
          provider: PaymentProvider.MANUAL,
          status: PaymentStatus.SUCCEEDED,
        }),
      );
      expect(result.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(result.paidAt).toBeUndefined();
      // Only this payment's amount is added to budget.spent, not the running total.
      expect(projects.increaseBudgetSpent).toHaveBeenCalledWith('proj1', 400);
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['admin1'],
        expect.objectContaining({ type: 'invoice_partially_paid' }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice.partial_payment' }),
      );
    });

    it('flips to PAID once accumulated payments reach the total', async () => {
      const invoice = makeInvoiceDoc({
        status: InvoiceStatus.SENT,
        total: 1000,
      });
      model.findById.mockResolvedValue(invoice);

      await service.recordPayment(INVOICE_ID, { amount: 400 }, 'admin1'); // partial
      const result = await service.recordPayment(
        INVOICE_ID,
        { amount: 600 },
        'admin1',
      ); // completes it

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(result.paidAt).toBeInstanceOf(Date);
      expect(projects.increaseBudgetSpent).toHaveBeenLastCalledWith(
        'proj1',
        600,
      );
      expect(notifications.notifyMany).toHaveBeenLastCalledWith(
        ['admin1'],
        expect.objectContaining({ type: 'invoice_paid' }),
      );
      expect(auditLog.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'invoice.paid' }),
      );
    });

    it('accepts a payment against an already-partially-paid invoice', async () => {
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.PARTIALLY_PAID, total: 1000 }),
      );
      await expect(
        service.recordPayment(INVOICE_ID, { amount: 100 }, 'admin1'),
      ).resolves.toBeDefined();
    });
  });

  describe('markPaid (settles whatever balance remains in one action)', () => {
    it('rejects an already-paid invoice', async () => {
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.PAID }),
      );
      await expect(service.markPaid(INVOICE_ID, 'admin1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a voided invoice', async () => {
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.VOID }),
      );
      await expect(service.markPaid(INVOICE_ID, 'admin1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('settles the full remaining balance — not just the original total — for a partially paid invoice', async () => {
      ledger.push(400); // 400 already paid manually
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.PARTIALLY_PAID, total: 1000 }),
      );

      const result = await service.markPaid(INVOICE_ID, 'admin1');

      expect(paymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 600 }), // 1000 - 400 remaining, not 1000
      );
      expect(result.status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('confirmPaymentFromWebhook (Stripe path — no duplicate ledger row)', () => {
    it('does not create a second Payment row — PaymentService already wrote one before calling this', async () => {
      ledger.push(1000); // the row PaymentService.handleEvent already wrote
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.SENT, total: 1000 }),
      );

      const result = await service.confirmPaymentFromWebhook(INVOICE_ID, 1000);

      expect(paymentModel.create).not.toHaveBeenCalled();
      expect(result.status).toBe(InvoiceStatus.PAID);
    });

    it('attributes the audit entry to the invoice creator, not a fake system actor', async () => {
      ledger.push(1000);
      model.findById.mockResolvedValue(
        makeInvoiceDoc({
          status: InvoiceStatus.SENT,
          total: 1000,
          createdBy: 'creator1',
        }),
      );

      await service.confirmPaymentFromWebhook(INVOICE_ID, 1000);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'creator1',
          action: 'invoice.paid',
          meta: expect.objectContaining({
            source: 'stripe_webhook',
          }) as unknown,
        }),
      );
    });
  });

  describe('createFromChangeRequest (Phase 4.5 — approval auto-generates a draft invoice)', () => {
    it('creates a DRAFT one_off invoice priced from the change request, numbered from the same atomic counter', async () => {
      const invoice = await service.createFromChangeRequest({
        organizationId: 'org1',
        projectId: 'proj1',
        title: 'Change request: Add live chat widget',
        priceAmount: 1500,
        currency: 'USD',
        createdBy: 'pm1',
      });

      const year = new Date().getFullYear();
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: 'org1',
          project: 'proj1',
          number: `INV-${year}-00007`,
          type: 'one_off',
          lineItems: [
            {
              description: 'Change request: Add live chat widget',
              qty: 1,
              unitPrice: 1500,
            },
          ],
          subtotal: 1500,
          total: 1500,
          currency: 'USD',
          status: InvoiceStatus.DRAFT,
          createdBy: 'pm1',
        }),
      );
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      // Never auto-sent — sending stays a deliberate admin action, same as
      // every other invoice (see InvoiceService.send).
      expect(model.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: InvoiceStatus.SENT }),
      );
    });
  });

  describe('sendOverdueReminders (Finding 1.8 — bounded + batched)', () => {
    it('does no work when nothing is overdue', async () => {
      // find({ status: OVERDUE, reminderCount: { $lt: N } }) is awaited
      // directly in the service (no .lean()/.sort() chaining), so the mock
      // resolves straight to an array.
      model.find.mockResolvedValueOnce([]);

      const count = await service.sendOverdueReminders();

      expect(count).toBe(0);
      expect(users.findClientAdminsForOrgs).not.toHaveBeenCalled();
    });

    it('batches the org→admins lookup into a single call instead of one per invoice', async () => {
      const overdueInvoices = [
        {
          _id: 'i1',
          organization: { toString: () => 'org1' },
          number: 'INV-1',
          total: 100,
          currency: 'USD',
          dueDate: new Date(0),
        },
        {
          _id: 'i2',
          organization: { toString: () => 'org1' },
          number: 'INV-2',
          total: 200,
          currency: 'USD',
          dueDate: new Date(0),
        },
        {
          _id: 'i3',
          organization: { toString: () => 'org2' },
          number: 'INV-3',
          total: 300,
          currency: 'USD',
          dueDate: new Date(0),
        },
      ];
      model.find.mockResolvedValueOnce(overdueInvoices);
      users.findClientAdminsForOrgs.mockResolvedValue(
        new Map([
          ['org1', [{ _id: 'admin1' }]],
          ['org2', [{ _id: 'admin2' }]],
        ]),
      );

      const count = await service.sendOverdueReminders();

      expect(count).toBe(3);
      // One batched call, not three individual findClientAdmins() calls.
      expect(users.findClientAdminsForOrgs).toHaveBeenCalledTimes(1);
      expect(users.findClientAdminsForOrgs).toHaveBeenCalledWith([
        'org1',
        'org2',
      ]);
      expect(notifications.notifyMany).toHaveBeenCalledTimes(3);
      // Reminder counters bumped so a future run eventually stops re-notifying.
      expect(model.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['i1', 'i2', 'i3'] } },
        expect.objectContaining({ $inc: { reminderCount: 1 } }),
      );
    });
  });

  describe('generateDueRetainers — only issued templates bill', () => {
    it('never clones a DRAFT or VOID recurring invoice', async () => {
      model.find.mockResolvedValueOnce([]);

      await service.generateDueRetainers();

      const [filter] = model.find.mock.calls[0] as [
        { status: { $in: InvoiceStatus[] } },
      ];
      expect(filter.status.$in).not.toContain(InvoiceStatus.DRAFT);
      expect(filter.status.$in).not.toContain(InvoiceStatus.VOID);
      expect(filter.status.$in).toContain(InvoiceStatus.SENT);
    });

    it('voiding a retainer template also stops it recurring', async () => {
      const doc = makeInvoiceDoc({ recurring: true });
      model.findById.mockResolvedValue(doc);

      await service.void(INVOICE_ID, 'admin1');

      expect(doc.status).toBe(InvoiceStatus.VOID);
      expect(doc.recurring).toBe(false);
    });
  });

  describe('settleStripePayment — a webhook never silently drops money', () => {
    it('settles an open invoice', async () => {
      ledger.push(1000);
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.SENT, total: 1000 }),
      );

      await expect(
        service.settleStripePayment(INVOICE_ID, 1000),
      ).resolves.toBe('settled');
      expect(projects.increaseBudgetSpent).toHaveBeenCalledWith('proj1', 1000);
    });

    it('reports a payment on a voided invoice instead of throwing', async () => {
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.VOID }),
      );

      await expect(service.settleStripePayment(INVOICE_ID, 1000)).resolves.toBe(
        'void',
      );
    });

    it('reports a second full payment on an already-paid invoice as a duplicate', async () => {
      ledger.push(1000, 1000); // the original payment + this surplus one
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.PAID, total: 1000 }),
      );

      await expect(service.settleStripePayment(INVOICE_ID, 1000)).resolves.toBe(
        'duplicate',
      );
    });

    it('treats a retried delivery of the payment that paid the invoice as settled, not a duplicate', async () => {
      ledger.push(1000); // only this payment — it is what flipped the invoice to PAID
      model.findById.mockResolvedValue(
        makeInvoiceDoc({ status: InvoiceStatus.PAID, total: 1000 }),
      );

      await expect(service.settleStripePayment(INVOICE_ID, 1000)).resolves.toBe(
        'settled',
      );
    });

    it('compares in cents, so float rounding cannot strand an invoice at PARTIALLY_PAID', async () => {
      ledger.push(0.1, 0.2);
      const doc = makeInvoiceDoc({ status: InvoiceStatus.SENT, total: 0.3 });
      model.findById.mockResolvedValue(doc);

      await service.confirmPaymentFromWebhook(INVOICE_ID, 0.2);

      expect(doc.status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('getBalanceDue', () => {
    it('is the total minus every succeeded payment, never negative', async () => {
      ledger.push(250);
      model.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ total: 1000 }),
      });
      await expect(service.getBalanceDue(INVOICE_ID)).resolves.toBe(750);

      ledger.push(2000);
      await expect(service.getBalanceDue(INVOICE_ID)).resolves.toBe(0);
    });
  });
});
