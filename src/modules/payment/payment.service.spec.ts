import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { PaymentService } from './payment.service';
import { PaymentStatus } from './schemas/payment.schema';
import { InvoiceStatus } from 'src/modules/invoice/schemas/invoice.schema';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';

const INVOICE_ID = '507f1f77bcf86cd799439011';
const PROJECT_ID = '507f1f77bcf86cd799439022';

function paymentDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay1',
    amount: 1000,
    currency: 'USD',
    needsRefund: false,
    status: PaymentStatus.PENDING as PaymentStatus,
    settledAt: undefined as Date | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function sessionEvent(
  type: string,
  session: Partial<Stripe.Checkout.Session>,
): Stripe.Event {
  return {
    type,
    data: {
      object: {
        id: 'cs_1',
        amount_total: 100000,
        currency: 'usd',
        payment_status: 'paid',
        payment_intent: 'pi_1',
        metadata: { invoiceId: INVOICE_ID },
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}

describe('PaymentService', () => {
  let service: PaymentService;
  let model: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    updateOne: jest.Mock;
  };
  let invoices: {
    settleStripePayment: jest.Mock;
    findAccessibleRaw: jest.Mock;
    getBalanceDue: jest.Mock;
    findOne: jest.Mock;
  };
  let auditLog: { record: jest.Mock };
  let notifier: { notifyNew: jest.Mock };
  let stripe: {
    checkout: {
      sessions: { create: jest.Mock; retrieve: jest.Mock; expire: jest.Mock };
    };
  };

  beforeEach(() => {
    model = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue(paymentDoc()),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    invoices = {
      settleStripePayment: jest.fn().mockResolvedValue('settled'),
      findAccessibleRaw: jest.fn().mockResolvedValue({
        status: InvoiceStatus.SENT,
        total: 1000,
        currency: 'USD',
        number: 'INV-2026-00001',
        project: PROJECT_ID,
      }),
      getBalanceDue: jest.fn().mockResolvedValue(1000),
      findOne: jest.fn().mockResolvedValue({
        number: 'INV-2026-00001',
        createdBy: 'admin1',
      }),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    notifier = { notifyNew: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: jest.fn((key: string) =>
        ({
          'stripe.secretKey': 'sk_test_dummy',
          'stripe.webhookSecret': 'whsec_dummy',
          'portal.baseUrl': 'https://weblaud.com/portal',
        })[key],
      ),
    };

    service = new PaymentService(
      model as never,
      invoices as never,
      config as unknown as ConfigService,
      auditLog as never,
      notifier as never,
    );

    stripe = {
      checkout: {
        sessions: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'cs_new', url: 'https://stripe/x' }),
          retrieve: jest.fn(),
          expire: jest.fn().mockResolvedValue({}),
        },
      },
    };
    (service as unknown as { stripe: unknown }).stripe = stripe;
  });

  describe('webhook', () => {
    it('ignores a completed-but-unpaid session (delayed payment method)', async () => {
      await service.handleEvent(
        sessionEvent('checkout.session.completed', {
          payment_status: 'unpaid',
        }),
      );
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(invoices.settleStripePayment).not.toHaveBeenCalled();
    });

    it('settles on async_payment_succeeded', async () => {
      await service.handleEvent(
        sessionEvent('checkout.session.async_payment_succeeded', {}),
      );
      expect(invoices.settleStripePayment).toHaveBeenCalledWith(
        INVOICE_ID,
        1000,
      );
    });

    it('records the payment, settles the invoice, then marks the payment settled', async () => {
      const payment = paymentDoc();
      model.findOneAndUpdate.mockResolvedValue(payment);

      await service.handleEvent(sessionEvent('checkout.session.completed', {}));

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { providerRef: 'cs_1' },
        expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
        { upsert: true, new: true },
      );
      expect(payment.settledAt).toBeInstanceOf(Date);
      expect(payment.save).toHaveBeenCalled();
      expect(payment.needsRefund).toBe(false);
    });

    it('skips a redelivery of an already-settled payment', async () => {
      model.findOne.mockResolvedValue(paymentDoc({ settledAt: new Date() }));

      await service.handleEvent(sessionEvent('checkout.session.completed', {}));

      expect(invoices.settleStripePayment).not.toHaveBeenCalled();
    });

    it('retries settlement when an earlier delivery recorded SUCCEEDED but never settled', async () => {
      model.findOne.mockResolvedValue(
        paymentDoc({ status: PaymentStatus.SUCCEEDED, settledAt: undefined }),
      );

      await service.handleEvent(sessionEvent('checkout.session.completed', {}));

      expect(invoices.settleStripePayment).toHaveBeenCalled();
    });

    it('leaves settledAt unset when settlement throws, so Stripe retries', async () => {
      const payment = paymentDoc();
      model.findOneAndUpdate.mockResolvedValue(payment);
      invoices.settleStripePayment.mockRejectedValue(new Error('db down'));

      await expect(
        service.handleEvent(sessionEvent('checkout.session.completed', {})),
      ).rejects.toThrow('db down');
      expect(payment.settledAt).toBeUndefined();
    });

    it.each(['duplicate', 'void'] as const)(
      'flags a %s payment for refund, audits it and alerts the admin instead of swallowing it',
      async (outcome) => {
        const payment = paymentDoc();
        model.findOneAndUpdate.mockResolvedValue(payment);
        invoices.settleStripePayment.mockResolvedValue(outcome);

        await service.handleEvent(
          sessionEvent('checkout.session.completed', {}),
        );

        expect(payment.needsRefund).toBe(true);
        expect(payment.settledAt).toBeInstanceOf(Date);
        expect(auditLog.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'payment.needs_refund',
            meta: expect.objectContaining({ reason: outcome }) as unknown,
          }),
        );
        expect(notifier.notifyNew).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'payment that needs a refund' }),
        );
      },
    );

    it('marks a pending payment failed when its session expires', async () => {
      await service.handleEvent(
        sessionEvent('checkout.session.expired', { payment_status: 'unpaid' }),
      );
      expect(model.updateOne).toHaveBeenCalledWith(
        { providerRef: 'cs_1', status: PaymentStatus.PENDING },
        { status: PaymentStatus.FAILED },
      );
    });
  });

  describe('createCheckoutSession', () => {
    const clientAdmin = {
      _id: 'u1',
      role: Role.USER,
      orgRole: OrgRole.CLIENT_ADMIN,
    };

    it('charges the remaining balance and returns to an existing portal page', async () => {
      invoices.findAccessibleRaw.mockResolvedValue({
        status: InvoiceStatus.PARTIALLY_PAID,
        total: 1000,
        currency: 'USD',
        number: 'INV-2026-00001',
        project: PROJECT_ID,
      });
      invoices.getBalanceDue.mockResolvedValue(400);

      await service.createCheckoutSession(INVOICE_ID, clientAdmin);

      const args = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(args.line_items[0].price_data.unit_amount).toBe(40000);
      expect(args.success_url).toBe(
        `https://weblaud.com/portal/projects/${PROJECT_ID}/billing/invoices?paid=1`,
      );
    });

    it('expires an earlier open checkout before creating a new one', async () => {
      const earlier = paymentDoc({
        providerRef: 'cs_old',
        status: PaymentStatus.PENDING,
      });
      model.find.mockResolvedValue([earlier]);
      stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'open' });

      await service.createCheckoutSession(INVOICE_ID, clientAdmin);

      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_old');
      expect(earlier.status).toBe(PaymentStatus.FAILED);
      expect(stripe.checkout.sessions.create).toHaveBeenCalled();
    });

    it('refuses a new checkout while an earlier one has already completed', async () => {
      model.find.mockResolvedValue([
        paymentDoc({ providerRef: 'cs_old', status: PaymentStatus.PENDING }),
      ]);
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        status: 'complete',
      });

      await expect(
        service.createCheckoutSession(INVOICE_ID, clientAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('refuses when nothing is left to pay', async () => {
      invoices.getBalanceDue.mockResolvedValue(0);
      await expect(
        service.createCheckoutSession(INVOICE_ID, clientAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
