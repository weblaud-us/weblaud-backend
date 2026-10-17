import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  ClientProject,
  ClientProjectDocument,
  ClientProjectStatus,
} from 'src/modules/client-project/schemas/client-project.schema';
import {
  Task,
  TaskDocument,
  TaskStatus,
} from 'src/modules/task/schemas/task.schema';
import {
  ProjectUpdate,
  ProjectUpdateDocument,
  ProjectUpdateStatus,
} from 'src/modules/project-update/schemas/project-update.schema';
import {
  FileVisibility,
  ProjectFile,
  ProjectFileDocument,
} from 'src/modules/file/schemas/project-file.schema';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from 'src/modules/invoice/schemas/invoice.schema';
import { PortalDashboardService } from 'src/modules/dashboard/portal-dashboard.service';
import { UsersService } from 'src/modules/users/users.service';
import { MailService } from 'src/modules/mail/mail.service';
import { Role } from 'src/common/enum/user.role.enum';
import { portalProjectLink } from 'src/common/utils/portal-links.util';
import { siteUrl } from 'src/common/utils/site-url.util';
import { signUnsubscribeToken } from 'src/common/utils/email-preference-token.util';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Invoices due within this many days get a "coming up" line. */
const DUE_SOON_DAYS = 14;
/** Per-section cap so a busy week stays a readable email. */
const SECTION_LIMIT = 10;

/** Monday 00:00 UTC of the week containing `date` — the digest's once-per-week boundary. */
export function startOfUtcWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - daysSinceMonday * DAY_MS);
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export interface DigestLine {
  title: string;
  meta?: string;
}

export interface DigestContent {
  completed: DigestLine[];
  updates: DigestLine[];
  files: DigestLine[];
  waiting: DigestLine[];
  dueSoon: DigestLine[];
}

function isEmpty(content: DigestContent): boolean {
  return Object.values(content).every((lines) => lines.length === 0);
}

type DigestProject = {
  _id: Types.ObjectId;
  name: string;
  organization: Types.ObjectId;
  timeline?: {
    milestones?: { title: string; status: string; completedAt?: Date }[];
  };
};

/**
 * Monday-morning email to each client user: what happened on their project
 * last week, what's waiting on them, and what's due soon. Most clients
 * don't log in, so this is how they stay informed.
 *
 * Runs once per week per project: lastDigestAt is claimed atomically right
 * before sending, so a restart (or a second instance) during the run can't
 * send a project's week twice. A project with nothing to say is skipped.
 */
@Injectable()
export class ProjectDigestService {
  private readonly logger = new Logger(ProjectDigestService.name);

  constructor(
    @InjectModel(ClientProject.name)
    private readonly projects: Model<ClientProjectDocument>,
    @InjectModel(Task.name)
    private readonly tasks: Model<TaskDocument>,
    @InjectModel(ProjectUpdate.name)
    private readonly updates: Model<ProjectUpdateDocument>,
    @InjectModel(ProjectFile.name)
    private readonly files: Model<ProjectFileDocument>,
    @InjectModel(Invoice.name)
    private readonly invoices: Model<InvoiceDocument>,
    private readonly dashboard: PortalDashboardService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 8 * * 1', { name: 'weekly-project-digest', timeZone: 'UTC' })
  async handleWeeklyDigest() {
    try {
      const sent = await this.sendWeeklyDigests();
      this.logger.log(`Weekly project digest: ${sent} email(s) sent`);
    } catch (err) {
      this.logger.error(
        'Weekly project digest failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Returns how many emails went out. `now` is injectable for the spec. */
  async sendWeeklyDigests(now: Date = new Date()): Promise<number> {
    const weekStart = startOfUtcWeek(now);
    const notThisWeek = {
      $or: [
        { lastDigestAt: { $exists: false } },
        { lastDigestAt: null },
        { lastDigestAt: { $lt: weekStart } },
      ],
    };

    const projects = (await this.projects
      .find({ status: ClientProjectStatus.ACTIVE, ...notThisWeek })
      .select('name organization timeline')
      .lean()) as unknown as DigestProject[];
    if (projects.length === 0) return 0;

    const recipientsByOrg = await this.users.findDigestRecipientsForOrgs([
      ...new Set(projects.map((p) => p.organization.toString())),
    ]);

    let sent = 0;
    for (const project of projects) {
      try {
        const recipients =
          recipientsByOrg.get(project.organization.toString()) ?? [];
        if (recipients.length === 0) continue;

        const content = await this.buildContent(project, now);
        if (isEmpty(content)) continue;

        // The claim: only the run that flips lastDigestAt for this week sends.
        const claimed = await this.projects.findOneAndUpdate(
          { _id: project._id, ...notThisWeek },
          { $set: { lastDigestAt: now } },
        );
        if (!claimed) continue;

        for (const recipient of recipients) {
          if (!recipient.email) continue;
          await this.sendOne(project, content, recipient);
          sent += 1;
        }
      } catch (err) {
        this.logger.error(
          `Weekly digest failed for project ${project._id.toString()}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return sent;
  }

  /** Everything the email says about one project. Exported shape for the spec. */
  async buildContent(
    project: DigestProject,
    now: Date,
  ): Promise<DigestContent> {
    const projectId = project._id.toString();
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const dueBy = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);

    const [tasks, updates, files, dueInvoices, attention] = await Promise.all([
      this.tasks
        .find({
          project: projectId,
          clientVisible: true,
          status: TaskStatus.DONE,
          completedAt: { $gte: since, $lte: now },
        })
        .sort({ completedAt: -1 })
        .limit(SECTION_LIMIT)
        .select('title')
        .lean(),
      this.updates
        .find({
          project: projectId,
          status: ProjectUpdateStatus.PUBLISHED,
          publishedAt: { $gte: since, $lte: now },
        })
        .sort({ publishedAt: -1 })
        .limit(SECTION_LIMIT)
        .select('title')
        .lean(),
      this.files
        .find({
          project: projectId,
          visibility: FileVisibility.CLIENT,
          createdAt: { $gte: since, $lte: now },
        })
        .sort({ createdAt: -1 })
        .limit(SECTION_LIMIT)
        .select('name')
        .lean(),
      this.invoices
        .find({
          project: projectId,
          status: {
            $in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID],
          },
          dueDate: { $gte: now, $lte: dueBy },
        })
        .sort({ dueDate: 1 })
        .limit(SECTION_LIMIT)
        .select('number total currency dueDate')
        .lean(),
      // What a client user of this org would see in their portal inbox.
      // No _id on the synthesized actor, so no per-user mentions.
      this.dashboard.projectAttention(projectId, {
        role: Role.USER,
        organization: project.organization,
      }),
    ]);

    const milestones = (project.timeline?.milestones ?? []).filter(
      (m) =>
        m.status === 'done' &&
        m.completedAt &&
        new Date(m.completedAt) >= since &&
        new Date(m.completedAt) <= now,
    );

    const s = attention.summary;
    const waiting = [
      s.contractsAwaitingSignature,
      s.pendingApprovals,
      s.changeRequestsAwaitingDecision,
      s.overdueInvoices,
    ].flatMap((group) =>
      group.items.map((item) => ({ title: item.title, meta: item.meta })),
    );

    return {
      completed: [
        ...milestones.map((m) => ({ title: m.title, meta: 'Milestone' })),
        ...tasks.map((t: any) => ({ title: t.title })),
      ].slice(0, SECTION_LIMIT),
      updates: updates.map((u: any) => ({ title: u.title })),
      files: files.map((f: any) => ({ title: f.name })),
      waiting: waiting.slice(0, SECTION_LIMIT),
      dueSoon: dueInvoices.map((i: any) => ({
        title: `Invoice ${i.number}`,
        meta: `${money(i.total, i.currency)} due ${dateFmt.format(new Date(i.dueDate))}`,
      })),
    };
  }

  private async sendOne(
    project: DigestProject,
    content: DigestContent,
    recipient: { _id: unknown; firstName?: string; email: string },
  ) {
    const portalBase = this.config.get<string>('portal.baseUrl');
    const secret = this.config.get<string>('mail.unsubscribeSecret');
    const uid = String(recipient._id);
    const unsubscribeUrl = secret
      ? siteUrl(
          portalBase,
          `/email-preferences/unsubscribe?${new URLSearchParams({
            uid,
            token: signUnsubscribeToken(uid, secret),
            category: 'digest',
          })}`,
        )
      : undefined;

    await this.mail.sendEmail({
      to: recipient.email,
      subject: `Your week on ${project.name}`,
      template: 'weekly-digest',
      context: {
        firstName: recipient.firstName,
        projectName: project.name,
        ...content,
        actionUrl: siteUrl(
          portalBase,
          portalProjectLink(project._id.toString(), 'overview'),
        ),
        unsubscribeUrl,
      },
    });
  }
}
