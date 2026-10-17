import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from './schemas/contact.schema';
import { CreateContactDto } from './dto/create-contact.dto';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { classifySubmission } from 'src/common/utils/spam-filter.util';
import { LeadReplyService } from '../leads/lead-reply.service';
import {
  BUDGET_LABELS,
  LEAD_STAGES,
  TIMELINE_LABELS,
  stageFilter,
} from '../leads/lead.constants';
import { sourceRows } from '../leads/lead-source.util';
import { buildPipelineUpdate } from '../leads/lead-pipeline.util';
import { UpdateLeadPipelineDto } from '../leads/dto/update-lead-pipeline.dto';

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * At most one auto-reply per address per window. The reply goes to whatever
 * address was typed into a public form, so without this the form could be
 * used to send repeated mail from our domain to someone else's inbox.
 */
const AUTO_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONTACT_STATUSES = ['new', 'read', 'spam'];

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    private readonly dashboardNotifier: DashboardNotifierService,
    private readonly leadReply: LeadReplyService,
  ) {}

  async submit(dto: CreateContactDto) {
    // The same message from the same address already arrived recently — a
    // double-submit or a bot replaying itself. Answer success (nothing for a
    // bot to tune against) without storing or mailing it a second time.
    const duplicate = await this.contactModel.exists({
      email: dto.email,
      message: dto.message,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (duplicate) return { received: true };

    const verdict = classifySubmission({
      name: `${dto.firstName} ${dto.lastName}`,
      message: dto.message,
    });
    if (verdict.spam) {
      // Kept, not dropped: a false positive must stay recoverable from the
      // admin panel's Spam tab. It just never reaches anyone's inbox.
      await this.contactModel.create({
        ...dto,
        status: 'spam',
        spamReason: verdict.reason,
      });
      return { received: true };
    }

    const saved = await this.contactModel.create(dto);
    // Only clean submissions get an auto-reply: spam and duplicates already
    // returned above, so a bot never gets mail out of us.
    await Promise.all([this.notifyAdmin(saved), this.replyToLead(saved)]);

    // Same response on every path (clean, spam, duplicate) — the submitter
    // never learns which bucket they landed in.
    return { received: true };
  }

  /** Never rejects — the lead is already saved. */
  private async replyToLead(contact: ContactDocument) {
    try {
      const alreadyReplied = await this.contactModel.exists({
        email: contact.email,
        autoReplySentAt: {
          $gte: new Date(Date.now() - AUTO_REPLY_WINDOW_MS),
        },
      });
      if (alreadyReplied) return;

      const sent = await this.leadReply.sendContactConfirmation(
        contact.email,
        contact.firstName,
      );
      if (sent) {
        await this.contactModel.updateOne(
          { _id: contact._id },
          { autoReplySentAt: new Date() },
        );
      }
    } catch (err) {
      this.logger.error(
        `Auto-reply bookkeeping for contact ${String(contact._id)} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async notifyAdmin(contact: ContactDocument) {
    // notifyNew never rejects, so a mail outage cannot turn an already-persisted
    // lead into a 500 for the visitor.
    await this.dashboardNotifier.notifyNew({
      kind: 'contact message',
      rows: [
        {
          label: 'Name',
          value: `${contact.firstName} ${contact.lastName}`.trim(),
        },
        {
          label: 'Email',
          value: contact.email,
          href: `mailto:${contact.email}`,
        },
        {
          label: 'Phone',
          value: contact.phone,
          href: contact.phone ? `tel:${contact.phone}` : undefined,
        },
        {
          label: 'Budget',
          value: contact.budget
            ? BUDGET_LABELS[contact.budget as keyof typeof BUDGET_LABELS]
            : undefined,
        },
        {
          label: 'Timeline',
          value: contact.timeline
            ? TIMELINE_LABELS[contact.timeline as keyof typeof TIMELINE_LABELS]
            : undefined,
        },
        { label: 'Message', value: contact.message },
        ...sourceRows(contact.attribution, contact.heardAbout),
      ],
      dashboardPath: '/contact-submissions',
      recordId: String(contact._id),
    });
  }

  async findAll(page = 1, limit = 20, status?: string, stage?: string) {
    const skip = (page - 1) * limit;
    // Was previously unfilterable — the admin dashboard's "new submissions"
    // count had to fetch up to 200 rows and filter status client-side,
    // silently undercounting whenever there were more than that many.
    //
    // Spam stays out of the default (unfiltered) list so it doesn't drown real
    // leads — it is only shown when asked for explicitly via ?status=spam.
    const filter = {
      ...(status && CONTACT_STATUSES.includes(status)
        ? { status }
        : { status: { $ne: 'spam' } }),
      ...(stage && (LEAD_STAGES as readonly string[]).includes(stage)
        ? stageFilter(stage)
        : {}),
    };

    const [items, total] = await Promise.all([
      this.contactModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.contactModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(id: string) {
    const updated = await this.contactModel.findByIdAndUpdate(
      id,
      { status: 'read' },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Message not found');

    return updated;
  }

  /**
   * Rescues a false positive from the Spam tab: back to `new`, and the admin
   * notification that was withheld at submit time is sent now, so the lead
   * gets the same follow-up path as any other.
   */
  async markNotSpam(id: string) {
    const updated = await this.contactModel.findOneAndUpdate(
      { _id: id, status: 'spam' },
      { status: 'new', $unset: { spamReason: 1 } },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Spam message not found');

    await this.notifyAdmin(updated);
    return updated;
  }

  async updatePipeline(id: string, dto: UpdateLeadPipelineDto) {
    const updated = await this.contactModel.findByIdAndUpdate(
      id,
      buildPipelineUpdate(dto),
      { new: true },
    );
    if (!updated) throw new NotFoundException('Message not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.contactModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Message not found');
    return { deleted: true };
  }
}
