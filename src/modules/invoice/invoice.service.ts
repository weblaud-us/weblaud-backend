import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
  InvoiceType,
} from './schemas/invoice.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { LineItemDto } from './dto/line-item.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import {
  Payment,
  PaymentDocument,
  PaymentProvider,
  PaymentStatus,
} from 'src/modules/payment/schemas/payment.schema';
import {
  TimeEntry,
  TimeEntryDocument,
} from 'src/modules/time-entry/schemas/time-entry.schema';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { UsersService } from 'src/modules/users/users.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { CounterService } from 'src/modules/counter/counter.service';
import {
  assertProjectAccess,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { Role } from 'src/common/enum/user.role.enum';

/** Money compared in whole cents — never compare float currency amounts directly. */
const toCents = (amount: number) => Math.round(amount * 100);

/** A recurring invoice only acts as a retainer template once it has been sent to the client. */
const RETAINER_TEMPLATE_STATUSES = [
  InvoiceStatus.SENT,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
];

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Invoice.name) private readonly model: Model<InvoiceDocument>,
    // Registered via InvoiceModule (schema only, not PaymentModule — importing
    // PaymentModule here would be circular, since PaymentService already
    // depends on InvoiceService). Used to write the ledger row for a manual
    // "mark paid"/"record payment" and to read it back for the Σ-payments
    // status derivation in settleFromLedger.
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    // Registered via InvoiceModule (schema only, not TimeEntryModule — see
    // that module's comment for the circularity this avoids). Used solely
    // to unlock any time entries billed to an invoice that's voided or
    // deleted — see void()/delete() below.
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    private readonly projects: ClientProjectService,
    private readonly users: UsersService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly counters: CounterService,
  ) {}

  private computeTotals(lineItems: LineItemDto[], tax = 0) {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.qty * item.unitPrice,
      0,
    );
    return { subtotal, tax, total: subtotal + tax };
  }

  /**
   * Atomic per-year sequence via CounterService — see its doc comment for
   * why `Model.countDocuments() + 1` (the previous scheme) collided after a
   * draft delete and raced under concurrent creates. Resets each calendar
   * year (`invoice-2026`, `invoice-2027`, ...), which is the numbering shape
   * accountants expect; the counter itself never resets or reuses a value.
   */
  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.counters.next(`invoice-${year}`);
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  }

  // ================================
  //     AGENCY SIDE (admin CRUD)
  // ================================

  async create(dto: CreateInvoiceDto, userId: string) {
    const totals = this.computeTotals(dto.lineItems, dto.tax ?? 0);
    const number = await this.nextNumber();

    return this.model.create({
      ...dto,
      number,
      ...totals,
      createdBy: userId,
    });
  }

  async findAll() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .populate('organization', 'name')
      .populate('project', 'name')
      .lean();
  }

  /**
   * Called from TimeEntryService.generateInvoice — the "generate invoice
   * from unbilled time" billing bridge (Phase 8). One line item per
   * contributor (see the caller for the hours×rate grouping); unlike
   * createFromChangeRequest this takes an explicit due date rather than a
   * fixed NET term, since billing a block of past work doesn't have the
   * same "just approved, quote a standard term" framing a change request
   * does. Always DRAFT, same reasoning as every other auto-generated invoice
   * here — an admin still reviews and sends it.
   */
  async createFromTimeEntries(params: {
    organizationId: string;
    projectId: string;
    lineItems: { description: string; qty: number; unitPrice: number }[];
    currency: string;
    dueDate: string;
    createdBy: string;
  }): Promise<InvoiceDocument> {
    const totals = this.computeTotals(params.lineItems);
    const number = await this.nextNumber();

    return this.model.create({
      organization: params.organizationId,
      project: params.projectId,
      number,
      type: InvoiceType.ONE_OFF,
      lineItems: params.lineItems,
      ...totals,
      currency: params.currency,
      status: InvoiceStatus.DRAFT,
      issueDate: new Date(),
      dueDate: new Date(params.dueDate),
      notes: 'Auto-generated from logged time.',
      createdBy: params.createdBy,
    });
  }

  /**
   * Called from ChangeRequestService.approve() the moment a client approves
   * priced scope — the whole point being that "approved" now means an
   * invoice already exists as a draft in /cpadmin/invoices, not that an
   * admin has to remember to hand-raise one that matches. Always a DRAFT:
   * sending is still a deliberate admin act (see InvoiceService.send), same
   * as every other invoice in the system.
   */
  async createFromChangeRequest(params: {
    organizationId: string;
    projectId: string;
    title: string;
    priceAmount: number;
    currency: string;
    createdBy: string;
  }): Promise<InvoiceDocument> {
    const lineItems = [
      { description: params.title, qty: 1, unitPrice: params.priceAmount },
    ];
    const totals = this.computeTotals(lineItems);
    const number = await this.nextNumber();
    const now = new Date();
    const NET_DAYS = 14;

    return this.model.create({
      organization: params.organizationId,
      project: params.projectId,
      number,
      type: InvoiceType.ONE_OFF,
      lineItems,
      ...totals,
      currency: params.currency,
      status: InvoiceStatus.DRAFT,
      issueDate: now,
      dueDate: new Date(now.getTime() + NET_DAYS * 24 * 60 * 60 * 1000),
      notes: 'Auto-generated from an approved change request.',
      createdBy: params.createdBy,
    });
  }

  async findOne(id: string) {
    const invoice = await this.model
      .findById(id)
      .populate('organization', 'name')
      .populate('project', 'name');
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft invoice can be edited — void it and raise a new one instead',
      );
    }

    // Recomputed unconditionally, not just when dto.lineItems is present — a
    // PATCH carrying only { tax } used to write the new tax and leave `total`
    // at its old value, so the invoice was then sent/PDF'd/paid at a total
    // that didn't match its own line items + tax. subtotal/total are meant
    // to be server-computed on every create/update (see the schema comment
    // on Invoice.subtotal); this is what actually makes that true.
    const update: Record<string, unknown> = { ...dto };
    Object.assign(
      update,
      this.computeTotals(
        dto.lineItems ?? invoice.lineItems,
        dto.tax ?? invoice.tax,
      ),
    );

    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  async send(id: string, actorId: string) {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only a draft invoice can be sent');
    }

    invoice.status = InvoiceStatus.SENT;
    await invoice.save();

    const clientAdmins = await this.users.findClientAdmins(
      invoice.organization.toString(),
    );
    await this.notifications.notifyMany(
      clientAdmins.map((u) => u._id),
      {
        type: 'invoice_sent',
        title: `New invoice ${invoice.number} — ${invoice.total} ${invoice.currency}`,
        link: `/portal/invoices/${id}`,
        email: {
          category: 'invoices',
          subject: `New invoice ${invoice.number} — ${invoice.total} ${invoice.currency}`,
          template: 'invoice-sent',
          context: {
            invoiceNumber: invoice.number,
            amount: invoice.total,
            currency: invoice.currency,
            dueDate: invoice.dueDate.toDateString(),
          },
        },
      },
    );

    await this.auditLog.record({
      actor: actorId,
      action: 'invoice.sent',
      entityType: 'Invoice',
      entityId: id,
    });

    return invoice;
  }

  /**
   * Records a manual settlement (bank transfer, check, cash) an admin enters
   * by hand, as an amount rather than an all-or-nothing flip — the ledger
   * row this creates is what makes `PaymentStatus.PARTIALLY_PAID` reachable:
   * status is derived from Σ succeeded payments vs `total`, not from a
   * single boolean. Previously `markPaid()` set status=PAID directly with
   * no Payment document at all, so PaymentProvider.MANUAL was defined and
   * never used, and there was no ledger to answer "what has this client
   * actually paid us".
   */
  async recordPayment(
    id: string,
    dto: RecordPaymentDto,
    actorId: string,
  ): Promise<InvoiceDocument> {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      ![
        InvoiceStatus.SENT,
        InvoiceStatus.OVERDUE,
        InvoiceStatus.PARTIALLY_PAID,
      ].includes(invoice.status)
    ) {
      throw new BadRequestException(
        'Only a sent, overdue, or partially paid invoice can receive a payment',
      );
    }

    await this.paymentModel.create({
      invoice: invoice._id,
      amount: dto.amount,
      currency: invoice.currency,
      provider: PaymentProvider.MANUAL,
      status: PaymentStatus.SUCCEEDED,
    });

    return this.settleFromLedger(id, invoice, dto.amount, actorId, 'manual');
  }

  /** Convenience for the common case — an admin clicking "mark paid" in /cpadmin settles whatever balance remains in one action. */
  async markPaid(id: string, actorId: string): Promise<InvoiceDocument> {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('This invoice is already marked paid');
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('A voided invoice cannot be marked paid');
    }

    const paidSoFar = await this.sumSucceededPayments(id);
    const remaining = invoice.total - paidSoFar;
    if (remaining <= 0) {
      throw new BadRequestException('This invoice is already marked paid');
    }

    return this.recordPayment(id, { amount: remaining }, actorId);
  }

  /**
   * Same ledger settlement, triggered by PaymentService's Stripe webhook.
   * The Payment row for this event was already created by
   * PaymentService.handleEvent (upsert, before this call) — recordPayment()
   * is not used here to avoid writing a second one for the same charge.
   * `amount` is the just-confirmed Stripe payment, passed down from the
   * webhook handler rather than re-derived here.
   */
  async confirmPaymentFromWebhook(
    id: string,
    amount: number,
  ): Promise<InvoiceDocument> {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    // There's no logged-in human to attribute the audit entry to, so it's
    // recorded against the invoice's creator instead of inventing a fake
    // "system" user id (AuditLog.actor is a real User ref).
    return this.settleFromLedger(
      id,
      invoice,
      amount,
      invoice.createdBy.toString(),
      'stripe_webhook',
    );
  }

  /**
   * The Stripe webhook's entry point. Settles normally when the invoice is
   * still open; otherwise says why it couldn't, instead of throwing — the
   * money has already moved by the time a webhook arrives, so "already paid"
   * and "voided" are not errors to swallow but refunds a human has to make
   * (PaymentService flags the Payment and alerts the admin). Previously a
   * second checkout on the same invoice charged the client twice and the
   * "already marked paid" exception was silently discarded.
   *
   * `duplicate` vs a retried delivery of this same payment: when the invoice
   * is already PAID, the ledger (which includes this payment) is checked —
   * if everything *before* this payment already covered the total, this one
   * is surplus; if not, this payment is what paid it on an earlier delivery
   * that failed after the invoice was saved, and it counts as settled.
   */
  async settleStripePayment(
    id: string,
    amount: number,
  ): Promise<'settled' | 'duplicate' | 'void'> {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.VOID) return 'void';
    if (invoice.status === InvoiceStatus.PAID) {
      const paidBeforeThis = (await this.sumSucceededPayments(id)) - amount;
      return toCents(paidBeforeThis) >= toCents(invoice.total)
        ? 'duplicate'
        : 'settled';
    }

    await this.confirmPaymentFromWebhook(id, amount);
    return 'settled';
  }

  /** What's still owed — total minus every succeeded payment, never negative. Drives the Stripe checkout amount. */
  async getBalanceDue(id: string): Promise<number> {
    const invoice = await this.model.findById(id).select('total');
    if (!invoice) throw new NotFoundException('Invoice not found');
    const paid = await this.sumSucceededPayments(id);
    return Math.max(0, toCents(invoice.total) - toCents(paid)) / 100;
  }

  /**
   * Shared tail of every settlement path: sums the ledger (which by now
   * already includes the payment just written by the caller), derives
   * PAID vs PARTIALLY_PAID from that sum against `total`, and fires the
   * matching notification/audit entry. `paymentAmount` — this specific
   * payment, not the running total — is what's added to the project's
   * budget.spent, so repeated partial payments accumulate correctly.
   * `invoiceId` is taken as an explicit string rather than read off
   * `invoice._id` — every caller already has the original string id in
   * scope, and Mongoose's Document._id doesn't type-narrow cleanly enough
   * to call .toString() on without a cast.
   */
  private async settleFromLedger(
    invoiceId: string,
    invoice: InvoiceDocument,
    paymentAmount: number,
    actorId: string,
    source: 'manual' | 'stripe_webhook',
  ): Promise<InvoiceDocument> {
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('This invoice is already marked paid');
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('A voided invoice cannot be marked paid');
    }

    const paidToDate = await this.sumSucceededPayments(invoiceId);
    // Compared in whole cents: summed float payments (0.1 + 0.2 …) or a
    // total with sub-cent precision would otherwise leave an invoice that
    // was paid in full stuck at PARTIALLY_PAID by a rounding hair.
    const isFullyPaid = toCents(paidToDate) >= toCents(invoice.total);

    invoice.status = isFullyPaid
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIALLY_PAID;
    if (isFullyPaid) invoice.paidAt = new Date();
    await invoice.save();

    await this.projects.increaseBudgetSpent(
      invoice.project.toString(),
      paymentAmount,
    );

    const clientAdmins = await this.users.findClientAdmins(
      invoice.organization.toString(),
    );
    await this.notifications.notifyMany(
      clientAdmins.map((u) => u._id),
      isFullyPaid
        ? {
            type: 'invoice_paid',
            title: `Invoice ${invoice.number} marked paid`,
            link: `/portal/invoices/${invoiceId}`,
          }
        : {
            type: 'invoice_partially_paid',
            title: `Payment received on invoice ${invoice.number} — ${paidToDate.toFixed(2)}/${invoice.total.toFixed(2)} ${invoice.currency}`,
            link: `/portal/invoices/${invoiceId}`,
          },
    );

    await this.auditLog.record({
      actor: actorId,
      action: isFullyPaid ? 'invoice.paid' : 'invoice.partial_payment',
      entityType: 'Invoice',
      entityId: invoiceId,
      meta: {
        amount: paymentAmount,
        paidToDate,
        total: invoice.total,
        currency: invoice.currency,
        source,
      },
    });

    return invoice;
  }

  private async sumSucceededPayments(invoiceId: string): Promise<number> {
    const result = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          invoice: new Types.ObjectId(invoiceId),
          status: PaymentStatus.SUCCEEDED,
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  }

  /** Payment history for an invoice — Stripe and manual settlements alike. Admin-only; see InvoiceController. */
  async findPayments(id: string) {
    return this.paymentModel
      .find({ invoice: id })
      .sort({ createdAt: -1 })
      .lean();
  }

  async void(id: string, actorId: string) {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('A paid invoice cannot be voided');
    }

    invoice.status = InvoiceStatus.VOID;
    // Voiding a retainer template also cancels the retainer — otherwise
    // generateDueRetainers kept cloning and auto-sending it every cycle.
    invoice.recurring = false;
    await invoice.save();

    // Any time entries billed to this invoice (see TimeEntryService.
    // generateInvoice) go back to unbilled — a voided invoice no longer
    // exists to bill against, so the hours it locked shouldn't stay stuck.
    // Deliberately after the status write above, not before: if this call
    // fails, the worst case is some entries stay locked (annoying, fixable),
    // rather than entries becoming unlocked while the invoice they were
    // billed on is still live — which would risk double-invoicing them.
    await this.timeEntryModel.updateMany(
      { invoiceId: id },
      { invoiced: false, $unset: { invoiceId: 1 } },
    );

    await this.auditLog.record({
      actor: actorId,
      action: 'invoice.voided',
      entityType: 'Invoice',
      entityId: id,
    });

    return invoice;
  }

  async delete(id: string) {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft invoice can be deleted — void it instead',
      );
    }
    await invoice.deleteOne();

    // Same unlock as void() above — a deleted draft no longer exists to
    // bill against either, and generateInvoice already locked its source
    // entries at creation time (invoices from time entries are always
    // created as drafts — see InvoiceService.createFromTimeEntries).
    await this.timeEntryModel.updateMany(
      { invoiceId: id },
      { invoiced: false, $unset: { invoiceId: 1 } },
    );

    return { deleted: true };
  }

  // ================================
  //     PORTAL SIDE (membership-scoped)
  // ================================

  /**
   * Every invoice has a required `project`, so — unlike Contract, which is
   * org-level with an optional project — access here is a single uniform
   * check: assertProjectAccess against the invoice's project covers admin,
   * assigned staff, and the project's client org in one call.
   *
   * Takes a raw project-id STRING, not the invoice document — that's
   * deliberate. Every call site here fetches once already-populated (for the
   * response) and once raw (for this check); passing the whole document
   * invited exactly the bug this used to have: `invoice.project.toString()`
   * on a *populated* project silently returns "[object Object]", not a real
   * id, and findAccessSubject() then either 404s or CastErrors on it. Taking
   * a string makes it impossible to accidentally pass a populated document.
   */
  private async assertAccess(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
  }

  /**
   * Merges `amountPaid` onto every PARTIALLY_PAID invoice in the list —
   * the only status where "what's actually still owed" isn't derivable
   * from `total` alone (SENT/OVERDUE have zero payments by construction;
   * settleFromLedger flips them away from those the instant any payment
   * lands). Portal responses otherwise carry no ledger data, so summing
   * `total` for a partially-paid invoice would overstate the real balance
   * — see the portal billing page (GET /portal/invoices) this feeds.
   * Batched (one query for every partially-paid id in the list), not
   * per-invoice, and merged in application code rather than folding the
   * existing `.populate().lean()` reads into a full aggregation.
   */
  private async withAmountPaid<
    T extends { _id: unknown; status: InvoiceStatus },
  >(invoices: T[]): Promise<(T & { amountPaid?: number })[]> {
    const partialIds = invoices
      .filter((inv) => inv.status === InvoiceStatus.PARTIALLY_PAID)
      .map((inv) => inv._id);
    if (partialIds.length === 0) return invoices;

    const sums = await this.paymentModel.aggregate<{
      _id: Types.ObjectId;
      paid: number;
    }>([
      {
        $match: {
          invoice: { $in: partialIds },
          status: PaymentStatus.SUCCEEDED,
        },
      },
      { $group: { _id: '$invoice', paid: { $sum: '$amount' } } },
    ]);
    const paidById = new Map(sums.map((s) => [s._id.toString(), s.paid]));

    return invoices.map((inv) =>
      inv.status === InvoiceStatus.PARTIALLY_PAID
        ? { ...inv, amountPaid: paidById.get(String(inv._id)) ?? 0 }
        : inv,
    );
  }

  async findForPortalUser(actor: ProjectAccessActor) {
    let query: Record<string, unknown> = {};

    if (actor.role === Role.USER) {
      query = { organization: actor.organization };
    } else if (actor.role !== Role.ADMIN) {
      // Staff — and any other non-admin role, e.g. EDITOR — only see their
      // own projects; never fall through to the unfiltered admin query.
      const myProjects = await this.projects.findForPortalUser(actor);
      query = { project: { $in: myProjects.map((p) => p._id) } };
    }
    // ADMIN: no filter.

    const invoices = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('organization', 'name')
      .populate('project', 'name')
      .lean();
    return this.withAmountPaid(invoices);
  }

  async findForProject(projectId: string, actor: ProjectAccessActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    const invoices = await this.model
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();
    return this.withAmountPaid(invoices);
  }

  async findOneForPortalUser(id: string, actor: ProjectAccessActor) {
    const raw = await this.model.findById(id).select('project');
    if (!raw) throw new NotFoundException('Invoice not found');
    await this.assertAccess(raw.project.toString(), actor);

    const invoice = await this.model
      .findById(id)
      .populate('organization', 'name')
      .populate('project', 'name');
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Raw (unpopulated) fetch + access check — for PaymentService, which needs the bare document to build a Checkout Session. */
  async findAccessibleRaw(
    id: string,
    actor: ProjectAccessActor,
  ): Promise<InvoiceDocument> {
    const invoice = await this.model.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.assertAccess(invoice.project.toString(), actor);
    return invoice;
  }

  async streamPdf(
    id: string,
    actor: ProjectAccessActor,
    res: NodeJS.WritableStream,
  ) {
    const raw = await this.model.findById(id).select('project');
    if (!raw) throw new NotFoundException('Invoice not found');
    await this.assertAccess(raw.project.toString(), actor);

    const invoice = await this.model
      .findById(id)
      .populate('organization', 'name billingEmail address')
      .populate('project', 'name');
    if (!invoice) throw new NotFoundException('Invoice not found');

    const org = invoice.organization as unknown as {
      name: string;
      billingEmail: string;
      address: string;
    };
    const project = invoice.project as unknown as { name: string };

    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    doc.pipe(res);

    doc.fontSize(20).text(`Invoice ${invoice.number}`, { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor('#666')
      .text(`Status: ${invoice.status.toUpperCase()}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(11);
    doc.text(`Bill to: ${org?.name ?? ''}`);
    if (org?.address) doc.text(org.address);
    if (org?.billingEmail) doc.text(org.billingEmail);
    doc.moveDown(0.5);
    doc.text(`Project: ${project?.name ?? ''}`);
    doc.text(`Issue date: ${invoice.issueDate.toDateString()}`);
    doc.text(`Due date: ${invoice.dueDate.toDateString()}`);
    doc.moveDown();

    doc.fontSize(12).text('Line items', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const item of invoice.lineItems) {
      const lineTotal = (item.qty * item.unitPrice).toFixed(2);
      doc.text(
        `${item.description}  —  ${item.qty} x ${item.unitPrice} ${invoice.currency}  =  ${lineTotal} ${invoice.currency}`,
      );
    }

    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Subtotal: ${invoice.subtotal.toFixed(2)} ${invoice.currency}`);
    if (invoice.tax)
      doc.text(`Tax: ${invoice.tax.toFixed(2)} ${invoice.currency}`);
    doc
      .fontSize(13)
      .text(`Total: ${invoice.total.toFixed(2)} ${invoice.currency}`);

    if (invoice.notes) {
      doc.moveDown();
      doc.fontSize(10).fillColor('#666').text(invoice.notes);
    }

    doc.end();
  }

  // ================================
  //     SCHEDULED JOBS (see InvoiceSchedulerService)
  // ================================

  /** Reminders stop after this many runs — an invoice overdue for months shouldn't re-notify its client daily forever. */
  private static readonly MAX_OVERDUE_REMINDERS = 10;

  /**
   * Flips any sent-but-past-due invoice to `overdue`, then reminds the
   * client admins of every still-reminding overdue invoice (including ones
   * that became overdue on an earlier run) — one notification per invoice
   * per call, so the reminder repeats each day this job runs, bounded by
   * MAX_OVERDUE_REMINDERS.
   *
   * Bounded two ways versus the original version: the reminder count cap
   * above (so an old, forgotten invoice doesn't notify forever and this
   * job's cost doesn't grow without bound as the overdue backlog grows),
   * and a single batched org→client-admins lookup instead of one
   * findClientAdmins() query per invoice — most invoices in a run share a
   * handful of organizations.
   */
  async sendOverdueReminders(): Promise<number> {
    const now = new Date();

    await this.model.updateMany(
      { status: InvoiceStatus.SENT, dueDate: { $lt: now } },
      { status: InvoiceStatus.OVERDUE },
    );

    const overdue = await this.model.find({
      status: InvoiceStatus.OVERDUE,
      reminderCount: { $lt: InvoiceService.MAX_OVERDUE_REMINDERS },
    });

    if (overdue.length === 0) return 0;

    const orgIds = [
      ...new Set(overdue.map((invoice) => invoice.organization.toString())),
    ];
    const adminsByOrg = await this.users.findClientAdminsForOrgs(orgIds);

    for (const invoice of overdue) {
      const clientAdmins =
        adminsByOrg.get(invoice.organization.toString()) ?? [];
      const daysOverdue = Math.floor(
        (now.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      await this.notifications.notifyMany(
        clientAdmins.map((u) => u._id),
        {
          type: 'invoice_overdue',
          title: `Invoice ${invoice.number} is ${daysOverdue}d overdue`,
          body: `${invoice.total} ${invoice.currency} — due ${invoice.dueDate.toDateString()}.`,
          link: `/portal/invoices/${invoice._id}`,
          email: {
            category: 'invoices',
            subject: `Invoice ${invoice.number} is ${daysOverdue}d overdue`,
            template: 'invoice-overdue',
            context: {
              invoiceNumber: invoice.number,
              amount: invoice.total,
              currency: invoice.currency,
              daysOverdue,
            },
          },
        },
      );
    }

    await this.model.updateMany(
      { _id: { $in: overdue.map((invoice) => invoice._id) } },
      { $inc: { reminderCount: 1 }, lastReminderAt: now },
    );

    return overdue.length;
  }

  /**
   * A retainer "template" is any invoice with `recurring: true` and no
   * `recurringSourceId` of its own — i.e. not itself a previously generated
   * clone. That distinction is what stops this from cascading (cloning a
   * clone, which would double-bill every cycle).
   */
  async generateDueRetainers(): Promise<number> {
    // Only templates that were actually issued to the client. A DRAFT
    // (never reviewed or sent) or VOID (cancelled) recurring invoice used to
    // qualify too, and every clone of it is auto-SENT — billing a client for
    // a retainer nobody approved, or one that was cancelled.
    const templates = await this.model.find({
      recurring: true,
      recurringSourceId: { $exists: false },
      status: { $in: RETAINER_TEMPLATE_STATUSES },
    });

    let generated = 0;
    const DUE_TERM_DAYS = 15; // NET15 on every generated retainer invoice.

    for (const template of templates) {
      if (!template.recurrenceIntervalDays) continue;

      const lastAnchor = template.lastGeneratedAt ?? template.issueDate;
      const nextDue = new Date(
        lastAnchor.getTime() +
          template.recurrenceIntervalDays * 24 * 60 * 60 * 1000,
      );
      if (nextDue.getTime() > Date.now()) continue;

      const now = new Date();
      const number = await this.nextNumber();
      const dueDate = new Date(
        now.getTime() + DUE_TERM_DAYS * 24 * 60 * 60 * 1000,
      );

      const generatedInvoice = await this.model.create({
        organization: template.organization,
        project: template.project,
        number,
        type: template.type,
        lineItems: template.lineItems,
        subtotal: template.subtotal,
        tax: template.tax,
        total: template.total,
        currency: template.currency,
        status: InvoiceStatus.SENT, // Retainers auto-send — that's the point of automating them.
        issueDate: now,
        dueDate,
        notes: template.notes,
        recurringSourceId: template._id,
        createdBy: template.createdBy,
      });

      template.lastGeneratedAt = now;
      await template.save();
      generated++;

      const clientAdmins = await this.users.findClientAdmins(
        template.organization.toString(),
      );
      await this.notifications.notifyMany(
        clientAdmins.map((u) => u._id),
        {
          type: 'invoice_sent',
          title: `New retainer invoice ${number} — ${template.total} ${template.currency}`,
          link: `/portal/invoices/${generatedInvoice._id}`,
          email: {
            category: 'invoices',
            subject: `New retainer invoice ${number} — ${template.total} ${template.currency}`,
            template: 'invoice-sent',
            context: {
              invoiceNumber: number,
              amount: template.total,
              currency: template.currency,
              dueDate: dueDate.toDateString(),
            },
          },
        },
      );
    }

    return generated;
  }
}
