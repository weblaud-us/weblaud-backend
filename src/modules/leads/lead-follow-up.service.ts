import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from '../contact/schemas/contact.schema';
import {
  Estimate,
  EstimateDocument,
} from '../estimates/schemas/estimate.schema';
import { Audit, AuditDocument } from '../audits/schemas/audit.schema';
import {
  DashboardAlertRow,
  DashboardNotifierService,
} from '../mail/dashboard-notifier.service';
import { followUpDueFilter } from './lead.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Per source, so one busy inbox can't push the other off the email. */
const MAX_ROWS_PER_SOURCE = 25;

interface DueLead {
  name: string;
  email: string;
  createdAt?: Date;
  nextFollowUpAt?: Date;
}

/**
 * Once a day, one email listing every lead that needs a human: follow-up
 * dates that have arrived, and fresh leads nobody has moved out of `new`.
 * Speed-to-lead is the biggest lever on winning a deal, and this is what
 * stops a lead quietly aging in the inbox.
 */
@Injectable()
export class LeadFollowUpService {
  private readonly logger = new Logger(LeadFollowUpService.name);

  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Estimate.name)
    private readonly estimateModel: Model<EstimateDocument>,
    @InjectModel(Audit.name)
    private readonly auditModel: Model<AuditDocument>,
    private readonly dashboardNotifier: DashboardNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailyDigest() {
    try {
      const count = await this.sendFollowUpDigest();
      if (count) this.logger.log(`Sent follow-up digest for ${count} lead(s)`);
    } catch (err) {
      this.logger.error(
        'Lead follow-up digest failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Returns how many leads were listed (0 → no email sent). */
  async sendFollowUpDigest(now = new Date()): Promise<number> {
    const filter = followUpDueFilter(now);

    const [contacts, estimates, audits] = await Promise.all([
      this.contactModel
        .find({ ...filter, status: { $ne: 'spam' } })
        .sort({ createdAt: 1 })
        .lean(),
      this.estimateModel.find(filter).sort({ createdAt: 1 }).lean(),
      // Only claimed audits are leads — an anonymous run has no one to call.
      this.auditModel
        .find({ ...filter, email: { $exists: true } })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const total = contacts.length + estimates.length + audits.length;
    if (!total) return 0;

    const rows: DashboardAlertRow[] = [
      ...this.toRows(
        'Contact messages',
        '/contact-submissions',
        contacts.map((c) => ({
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email,
          createdAt: (c as { createdAt?: Date }).createdAt,
          nextFollowUpAt: c.nextFollowUpAt,
        })),
        now,
      ),
      ...this.toRows(
        'Estimates',
        '/estimate-submissions',
        estimates.map((e) => ({
          name: e.name,
          email: e.email,
          createdAt: (e as { createdAt?: Date }).createdAt,
          nextFollowUpAt: e.nextFollowUpAt,
        })),
        now,
      ),
      ...this.toRows(
        'Website audits',
        '/audit-submissions',
        audits.map((a) => ({
          name: a.name ? `${a.name} (${a.host})` : a.host,
          email: a.email ?? '',
          createdAt: (a as { createdAt?: Date }).createdAt,
          nextFollowUpAt: a.nextFollowUpAt,
        })),
        now,
      ),
    ];

    const truncated = [contacts, estimates, audits].some(
      (list) => list.length > MAX_ROWS_PER_SOURCE,
    );

    await this.dashboardNotifier.notifyNew({
      kind: 'lead follow-up digest',
      heading: `${total} lead${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} a follow-up`,
      intro: truncated
        ? `Showing the oldest ${MAX_ROWS_PER_SOURCE} per source — open the dashboard for the rest.`
        : undefined,
      rows,
      dashboardPath: '/',
    });

    return total;
  }

  private toRows(
    section: string,
    path: string,
    leads: DueLead[],
    now: Date,
  ): DashboardAlertRow[] {
    const href = this.dashboardNotifier.adminUrl(path) || undefined;
    return leads.slice(0, MAX_ROWS_PER_SOURCE).map((lead) => ({
      section,
      label: lead.name || lead.email,
      value: `${this.reason(lead, now)} · ${lead.email}`,
      href,
    }));
  }

  private reason(lead: DueLead, now: Date): string {
    if (lead.nextFollowUpAt && lead.nextFollowUpAt <= now) {
      return `Follow-up due ${lead.nextFollowUpAt.toISOString().slice(0, 10)}`;
    }
    const days = lead.createdAt
      ? Math.floor((now.getTime() - lead.createdAt.getTime()) / DAY_MS)
      : 0;
    return `Still "new" after ${days} day${days === 1 ? '' : 's'}`;
  }
}
