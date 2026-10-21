import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Audit, AuditDocument, AuditScores } from './schemas/audit.schema';
import { RunAuditDto } from './dto/run-audit.dto';
import { ClaimAuditDto } from './dto/claim-audit.dto';
import { normalizeAuditUrl } from './audit-url.util';
import { PageSpeedError, PageSpeedService } from './pagespeed.service';
import { DashboardNotifierService } from '../mail/dashboard-notifier.service';
import { LeadReplyService } from '../leads/lead-reply.service';
import { LEAD_STAGES, stageFilter } from '../leads/lead.constants';
import { sourceRows } from '../leads/lead-source.util';
import { buildPipelineUpdate } from '../leads/lead-pipeline.util';
import { UpdateLeadPipelineDto } from '../leads/dto/update-lead-pipeline.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Re-use a finished result for the same URL + strategy within this window. */
const RESULT_CACHE_MS = DAY_MS;
/**
 * A run still "running" after this was lost (process restart mid-run) —
 * report it as failed instead of leaving the visitor polling forever.
 */
const STALE_RUN_MS = 3 * 60 * 1000;
/** At most one emailed report per address per window — see ContactService. */
const AUTO_REPLY_WINDOW_MS = DAY_MS;

/** Claimed audits are leads; unclaimed ones are just anonymous tool usage. */
const CLAIMED = { email: { $exists: true } };

/** What the public polling endpoint may reveal: never contact details or the issue list. */
export interface PublicAuditResult {
  id: string;
  runStatus: 'running' | 'done' | 'failed';
  failureReason?: string;
  url: string;
  host: string;
  strategy: string;
  scores?: AuditScores;
  vitals?: Audit['vitals'];
  issueCount: number;
  claimed: boolean;
}

export const scoreLabel = (score: number) =>
  score >= 90 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor';

@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);

  constructor(
    @InjectModel(Audit.name)
    private readonly auditModel: Model<AuditDocument>,
    private readonly pagespeed: PageSpeedService,
    private readonly dashboardNotifier: DashboardNotifierService,
    private readonly leadReply: LeadReplyService,
  ) {}

  /**
   * Starts an audit and returns its id straight away; the visitor's page
   * polls getPublic() until it finishes. A long-held request would trip proxy
   * timeouts — Lighthouse on a slow site can take most of a minute.
   *
   * A finished result for the same URL from the last day is copied into a new
   * record rather than re-run: it saves API quota and stops the tool being
   * used to hammer a site. Copied, not shared, so each visitor can claim
   * their own report.
   */
  async run(dto: RunAuditDto): Promise<{ id: string }> {
    const target = normalizeAuditUrl(dto.url);
    if (!target) {
      throw new BadRequestException(
        'Enter a public website address, like example.com.',
      );
    }

    const cached = await this.auditModel
      .findOne({
        url: target.url,
        strategy: dto.strategy,
        runStatus: 'done',
        completedAt: { $gte: new Date(Date.now() - RESULT_CACHE_MS) },
      })
      .sort({ completedAt: -1 })
      .lean();

    if (cached) {
      const copy = await this.auditModel.create({
        url: target.url,
        host: target.host,
        strategy: dto.strategy,
        runStatus: 'done',
        scores: cached.scores,
        vitals: cached.vitals,
        issues: cached.issues,
        completedAt: cached.completedAt,
      });
      return { id: String(copy._id) };
    }

    const audit = await this.auditModel.create({
      url: target.url,
      host: target.host,
      strategy: dto.strategy,
      runStatus: 'running',
    });
    // Deliberately not awaited — see the method comment. complete() never
    // rejects, so this can't become an unhandled rejection.
    void this.complete(String(audit._id), target.url, dto.strategy);
    return { id: String(audit._id) };
  }

  /** Runs PageSpeed and records the outcome. Never rejects. */
  async complete(id: string, url: string, strategy: Audit['strategy']) {
    try {
      const result = await this.pagespeed.run(url, strategy);
      await this.auditModel.updateOne(
        { _id: id },
        { runStatus: 'done', ...result, completedAt: new Date() },
      );
    } catch (err) {
      const reason = err instanceof PageSpeedError ? err.reason : 'api';
      this.logger.warn(
        `Audit ${id} (${url}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      try {
        await this.auditModel.updateOne(
          { _id: id },
          {
            runStatus: 'failed',
            failureReason: reason,
            completedAt: new Date(),
          },
        );
      } catch (dbErr) {
        // getPublic() reports a stale "running" record as failed anyway.
        this.logger.error(
          `Could not mark audit ${id} failed`,
          dbErr instanceof Error ? dbErr.stack : String(dbErr),
        );
      }
    }
  }

  async getPublic(id: string): Promise<PublicAuditResult> {
    const audit = await this.findOrThrow(id);

    let runStatus = audit.runStatus;
    let failureReason = audit.failureReason;
    const createdAt = (audit as { createdAt?: Date }).createdAt;
    if (
      runStatus === 'running' &&
      createdAt &&
      Date.now() - createdAt.getTime() > STALE_RUN_MS
    ) {
      runStatus = 'failed';
      failureReason = 'timeout';
    }

    return {
      id: String(audit._id),
      runStatus,
      failureReason,
      url: audit.url,
      host: audit.host,
      strategy: audit.strategy,
      scores: audit.scores,
      vitals: audit.vitals,
      issueCount: audit.issues?.length ?? 0,
      claimed: !!audit.email,
    };
  }

  /**
   * The visitor trades contact details for the full report: the audit becomes
   * a lead, the team is notified, and the report is emailed. Claimable once.
   */
  async claim(id: string, dto: ClaimAuditDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Audit not found');

    const audit = await this.auditModel.findOneAndUpdate(
      { _id: id, runStatus: 'done', email: { $exists: false } },
      {
        $set: {
          name: dto.name.trim(),
          email: dto.email.trim(),
          company: dto.company?.trim() || undefined,
          attribution: dto.attribution,
          heardAbout: dto.heardAbout,
          claimedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!audit) {
      const existing = await this.auditModel
        .findById(id)
        .select('runStatus email')
        .lean();
      if (!existing) throw new NotFoundException('Audit not found');
      throw new ConflictException(
        existing.runStatus !== 'done'
          ? 'This audit has not finished yet.'
          : 'The report for this audit has already been sent.',
      );
    }

    await Promise.all([this.notifyAdmin(audit), this.replyToLead(audit)]);
    return { received: true };
  }

  private async notifyAdmin(audit: AuditDocument) {
    const s = audit.scores;
    await this.dashboardNotifier.notifyNew({
      kind: 'website audit',
      heading: `New website audit lead — ${audit.host}`,
      rows: [
        { label: 'Name', value: audit.name },
        { label: 'Email', value: audit.email, href: `mailto:${audit.email}` },
        { label: 'Company', value: audit.company },
        { section: 'Site', label: 'URL', value: audit.url, href: audit.url },
        { section: 'Site', label: 'Device', value: audit.strategy },
        {
          section: 'Site',
          label: 'Scores',
          value: s
            ? `Performance ${s.performance} · SEO ${s.seo} · Accessibility ${s.accessibility} · Best practices ${s.bestPractices}`
            : undefined,
        },
        {
          section: 'Site',
          label: 'Top issues',
          value: audit.issues.slice(0, 3).map((i) => i.title),
        },
        ...sourceRows(audit.attribution, audit.heardAbout),
      ],
      dashboardPath: '/audit-submissions',
      recordId: String(audit._id),
    });
  }

  /** Emails the full report. Never rejects. */
  private async replyToLead(audit: AuditDocument) {
    try {
      const alreadyReplied = await this.auditModel.exists({
        email: audit.email,
        autoReplySentAt: { $gte: new Date(Date.now() - AUTO_REPLY_WINDOW_MS) },
      });
      if (alreadyReplied || !audit.email || !audit.scores) return;

      const s = audit.scores;
      const v = audit.vitals;
      const sent = await this.leadReply.sendAuditReport(
        audit.email,
        audit.name,
        {
          host: audit.host,
          strategy: audit.strategy,
          // Plain values picked out — spreading Mongoose subdocuments copies
          // their internals, not their fields.
          scores: {
            performance: s.performance,
            seo: s.seo,
            accessibility: s.accessibility,
            bestPractices: s.bestPractices,
          },
          vitals: {
            lcpMs: v?.lcpMs,
            cls: v?.cls,
            tbtMs: v?.tbtMs,
            fcpMs: v?.fcpMs,
          },
          issues: audit.issues.map((i) => ({
            title: i.title,
            displayValue: i.displayValue,
            savingsMs: i.savingsMs,
          })),
        },
      );
      if (sent) {
        await this.auditModel.updateOne(
          { _id: audit._id },
          { autoReplySentAt: new Date() },
        );
      }
    } catch (err) {
      this.logger.error(
        `Report email bookkeeping for audit ${String(audit._id)} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // --- Admin ---

  async findAll(page = 1, limit = 20, status?: string, stage?: string) {
    const skip = (page - 1) * limit;
    const filter = {
      ...CLAIMED,
      ...(status ? { status } : {}),
      ...(stage && (LEAD_STAGES as readonly string[]).includes(stage)
        ? stageFilter(stage)
        : {}),
    };

    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ claimedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneForAdmin(id: string) {
    const audit = await this.findOrThrow(id);
    return audit;
  }

  async markRead(id: string) {
    const updated = await this.auditModel.findOneAndUpdate(
      { _id: id, ...CLAIMED },
      { status: 'read' },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Audit not found');
    return updated;
  }

  async updatePipeline(id: string, dto: UpdateLeadPipelineDto) {
    const updated = await this.auditModel.findOneAndUpdate(
      { _id: id, ...CLAIMED },
      buildPipelineUpdate(dto),
      { new: true },
    );
    if (!updated) throw new NotFoundException('Audit not found');
    return updated;
  }

  async delete(id: string) {
    const deleted = await this.auditModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Audit not found');
    return { deleted: true };
  }

  private async findOrThrow(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Audit not found');
    const audit = await this.auditModel.findById(id).lean();
    if (!audit) throw new NotFoundException('Audit not found');
    return audit;
  }
}
