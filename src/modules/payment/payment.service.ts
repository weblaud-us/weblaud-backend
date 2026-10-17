import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  Payment,
  PaymentDocument,
  PaymentProvider,
  PaymentStatus,
} from './schemas/payment.schema';
import { InvoiceService } from 'src/modules/invoice/invoice.service';
import { InvoiceStatus } from 'src/modules/invoice/schemas/invoice.schema';
import { ProjectAccessActor } from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';
import { siteUrl } from 'src/common/utils/site-url.util';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { DashboardNotifierService } from 'src/modules/mail/dashboard-notifier.service';
import { portalProjectLink } from 'src/common/utils/portal-links.util';

interface Actor extends ProjectAccessActor {
  orgRole?: OrgRole;
}

/** Invoices a client can open a checkout for. */
const PAYABLE_STATUSES = [
  InvoiceStatus.SENT,
  // OVERDUE: flipped purely on the calendar (past dueDate) by
  // InvoiceService.sendOverdueReminders — says nothing about payment, and the
  // overdue invoice is the one a client is most motivated to pay now.
  InvoiceStatus.OVERDUE,
  // PARTIALLY_PAID: charged only the remaining balance (getBalanceDue).
  InvoiceStatus.PARTIALLY_PAID,
];

/** Webhook events that mean "this session's money has actually arrived". */
const PAID_EVENTS = new Set([
  'checkout.session.completed',
  // Delayed methods (ACH, SEPA, …) complete the session with
  // payment_status 'unpaid' first and only confirm funds later, here.
  'checkout.session.async_payment_succeeded',
]);

/** Webhook events that mean a pending checkout will never pay. */
const DEAD_SESSION_EVENTS = new Set([
  'checkout.session.expired',
  'checkout.session.async_payment_failed',
]);

/**
 * Stripe wiring is entirely optional. Every environment — including a bare
 * `pnpm seed:portal-demo` checkout with no .env changes — can exercise
 * contracts, change requests, approvals, and invoices end to end with no
 * Stripe account at all. Only the "Pay now" button needs real keys, and it
 * fails with a clear, actionable message instead of a 500 until they're set.
 * Mirrors the planned TrustpilotService no-op pattern.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret?: string;
  private readonly portalBaseUrl?: string;

  constructor(
    @InjectModel(Payment.name) private readonly model: Model<PaymentDocument>,
    private readonly invoices: InvoiceService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly dashboardNotifier: DashboardNotifierService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey');
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret');
    this.portalBaseUrl = this.config.get<string>('portal.baseUrl');

    this.stripe = secretKey ? new Stripe(secretKey) : null;
    if (!this.stripe) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not set — online payments are disabled. Invoices, contracts, and approvals all still work; only the "Pay now" button is affected.',
      );
    }
  }

  isConfigured(): boolean {
    return !!this.stripe && !!this.webhookSecret;
  }

  async createCheckoutSession(
    invoiceId: string,
    actor: Actor,
  ): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new BadRequestException(
        'Online payments are not configured yet — contact WebLaud to arrange payment directly.',
      );
    }
    if (actor.role !== Role.ADMIN && actor.orgRole !== OrgRole.CLIENT_ADMIN) {
      throw new ForbiddenException('Only a client admin can pay an invoice');
    }

    const invoice = await this.invoices.findAccessibleRaw(invoiceId, actor);
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(
        'Only a sent, overdue, or partially paid invoice can be paid',
      );
    }

    // The remaining balance, not `total`: a partially paid invoice used to
    // be either unpayable online or charged in full.
    const balanceDue = await this.invoices.getBalanceDue(invoiceId);
    const amountCents = Math.round(balanceDue * 100);
    if (amountCents <= 0) {
      throw new BadRequestException('This invoice has nothing left to pay');
    }

    const returnPath = portalProjectLink(invoice.project.toString(), 'invoices');
    const successUrl = siteUrl(this.portalBaseUrl, `${returnPath}?paid=1`);
    const cancelUrl = siteUrl(this.portalBaseUrl, `${returnPath}?cancelled=1`);
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        'PORTAL_URL is not configured — cannot build a return link for checkout',
      );
    }

    // One live checkout per invoice. Two open sessions (a second tab, a
    // double-click, a retry after a slow redirect) could both be paid, and
    // the second charge used to be silently discarded.
    await this.closeOpenSessions(invoiceId);

    const isPartial = amountCents < Math.round(invoice.total * 100);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: isPartial
                ? `Invoice ${invoice.number} — remaining balance`
                : `Invoice ${invoice.number}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: { invoiceId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new BadRequestException(
        'Stripe did not return a checkout URL — try again',
      );
    }

    await this.model.create({
      invoice: invoiceId,
      amount: amountCents / 100,
      currency: invoice.currency,
      provider: PaymentProvider.STRIPE,
      providerRef: session.id,
      status: PaymentStatus.PENDING,
    });

    return { url: session.url };
  }

  /**
   * Expires every still-open checkout for this invoice before a new one is
   * created. A session that has already *completed* can't be expired — its
   * money is in flight and its webhook will settle the invoice — so opening a
   * second checkout is refused rather than risking a double charge.
   */
  private async closeOpenSessions(invoiceId: string): Promise<void> {
    const stripe = this.stripe!;
    const pending = await this.model.find({
      invoice: invoiceId,
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.PENDING,
    });

    for (const payment of pending) {
      if (!payment.providerRef) continue;

      const session = await stripe.checkout.sessions.retrieve(
        payment.providerRef,
      );
      if (session.status === 'complete') {
        throw new BadRequestException(
          'A payment for this invoice is already being processed. Refresh the page in a minute to see it.',
        );
      }
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(payment.providerRef);
      }
      payment.status = PaymentStatus.FAILED;
      await payment.save();
    }
  }

  /**
   * `rawBody` must be the exact, unparsed request bytes — see main.ts's
   * `rawBody: true` option. A re-serialized JSON body will not byte-match
   * what Stripe signed and constructEvent() will reject every event.
   */
  verifyAndParseEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe || !this.webhookSecret) {
      throw new BadRequestException('Stripe webhooks are not configured');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    if (DEAD_SESSION_EVENTS.has(event.type)) {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.model.updateOne(
        { providerRef: session.id, status: PaymentStatus.PENDING },
        { status: PaymentStatus.FAILED },
      );
      return;
    }

    if (!PAID_EVENTS.has(event.type)) {
      return; // Not an event we act on — 200 with no side effect, standard webhook practice.
    }

    const session = event.data.object as Stripe.Checkout.Session;
    // A delayed payment method completes the session before the money
    // arrives; that 'unpaid' completion must not mark the invoice paid.
    // The later async_payment_succeeded event carries payment_status 'paid'.
    if (session.payment_status !== 'paid') {
      return;
    }

    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) {
      this.logger.error(
        `${event.type} for session ${session.id} carried no invoiceId metadata`,
      );
      return;
    }

    // Idempotency: Stripe redelivers events at least once. settledAt (not
    // status) is what marks a payment as fully applied — see its schema
    // comment for why keying on SUCCEEDED lost failed settlements.
    const existing = await this.model.findOne({ providerRef: session.id });
    if (existing?.settledAt) {
      return;
    }

    const amount = (session.amount_total ?? 0) / 100;

    const payment = await this.model.findOneAndUpdate(
      { providerRef: session.id },
      {
        invoice: invoiceId,
        amount,
        currency: (session.currency ?? 'usd').toUpperCase(),
        provider: PaymentProvider.STRIPE,
        providerRef: session.id,
        status: PaymentStatus.SUCCEEDED,
      },
      { upsert: true, new: true },
    );

    // Throws only on a real failure (DB error, missing invoice) — settledAt
    // stays unset and Stripe's retry runs this again, which is the point.
    const outcome = await this.invoices.settleStripePayment(invoiceId, amount);

    if (outcome !== 'settled') {
      await this.flagForRefund(payment, invoiceId, outcome, session);
    }

    payment.settledAt = new Date();
    await payment.save();
  }

  /**
   * Money arrived for an invoice that was already paid or has been voided.
   * Deliberately not auto-refunded — moving money back is a human decision —
   * but it must never be silent: the payment is flagged, audited, and the
   * admin inbox is told exactly what to refund.
   */
  private async flagForRefund(
    payment: PaymentDocument,
    invoiceId: string,
    reason: 'duplicate' | 'void',
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    payment.needsRefund = true;

    const invoice = await this.invoices.findOne(invoiceId);
    const why =
      reason === 'void'
        ? 'the invoice had been voided'
        : 'the invoice was already paid in full';

    this.logger.error(
      `Stripe payment ${session.id} (${payment.amount} ${payment.currency}) on invoice ${invoice.number} needs a refund: ${why}`,
    );

    await this.auditLog.record({
      actor: invoice.createdBy.toString(),
      action: 'payment.needs_refund',
      entityType: 'Invoice',
      entityId: invoiceId,
      meta: {
        reason,
        sessionId: session.id,
        paymentIntent:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id,
        amount: payment.amount,
        currency: payment.currency,
      },
    });

    await this.dashboardNotifier.notifyNew({
      kind: 'payment that needs a refund',
      heading: `Refund needed — invoice ${invoice.number}`,
      intro: `A Stripe payment arrived after ${why}. It was not applied to the invoice. Refund it from the Stripe dashboard.`,
      rows: [
        { label: 'Invoice', value: invoice.number },
        {
          label: 'Amount',
          value: `${payment.amount.toFixed(2)} ${payment.currency}`,
        },
        { label: 'Checkout session', value: session.id },
        {
          label: 'Payment intent',
          value:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id,
        },
      ],
      dashboardPath: `/invoices/${invoiceId}`,
      recordId: payment.id as string,
    });
  }
}
