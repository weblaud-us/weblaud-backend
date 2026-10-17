import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { siteUrl } from 'src/common/utils/site-url.util';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/**
 * A first name we're willing to print in "Hi …," — letters, apostrophes and
 * hyphens only. No dots: without them nothing can form a domain that a mail
 * client would auto-link.
 */
const GREETING_NAME = /^\p{L}[\p{L}'’-]{0,39}$/u;

/**
 * First word of a visitor-typed name, or undefined if it doesn't look like a
 * name. The auto-reply goes to whatever address the form was given, so
 * nothing free-form from the submission may appear in it — otherwise the form
 * becomes a relay for mailing arbitrary text (a URL in the "name" field) to
 * any inbox from our domain. This is the only visitor-supplied value the
 * replies print.
 */
export function greetingName(raw?: string): string | undefined {
  const first = raw?.trim().split(/\s+/)[0];
  return first && GREETING_NAME.test(first) ? first : undefined;
}

export interface AuditReport {
  host: string;
  strategy: string;
  scores: {
    performance: number;
    seo: number;
    accessibility: number;
    bestPractices: number;
  };
  vitals: { lcpMs?: number; cls?: number; tbtMs?: number; fcpMs?: number };
  issues: { title: string; displayValue?: string; savingsMs?: number }[];
}

/**
 * Lighthouse's own bands. The label always travels with the colour so the
 * state never depends on colour alone; the colours are dark enough to read
 * as text on white.
 */
export function scoreStatus(score: number) {
  if (score >= 90) return { status: 'Good', color: '#137333' };
  if (score >= 50) return { status: 'Needs work', color: '#b05a00' };
  return { status: 'Poor', color: '#c5221f' };
}

/** "3 more issues" / "1 more issue", or undefined (the template drops the line). */
const moreIssuesLabel = (n: number) =>
  n > 0 ? `${n} more issue${n === 1 ? '' : 's'}` : undefined;

const seconds = (msValue?: number) =>
  msValue === undefined ? undefined : `${(msValue / 1000).toFixed(1)} s`;
const ms = (msValue?: number) =>
  msValue === undefined ? undefined : `${Math.round(msValue)} ms`;

export interface EstimateSummary {
  projectTypeTitle: string;
  featureTitles: string[];
  speedLabel: string;
  totalWeeks: number;
  costMin: number;
  costMax: number;
}

/**
 * The visitor-facing half of lead handling: the immediate "we got it" reply.
 * DashboardNotifierService is the admin-facing half.
 *
 * Both methods never reject, for the same reason notifyNew doesn't: the lead
 * is already saved, and a mail outage must not turn that into a 500.
 */
@Injectable()
export class LeadReplyService {
  private readonly logger = new Logger(LeadReplyService.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  sendContactConfirmation(to: string, name?: string): Promise<boolean> {
    return this.send(to, 'contact', {
      subject: 'We got your message — Weblaud',
      template: 'lead-received',
      context: this.baseContext(name),
    });
  }

  sendEstimateSummary(
    to: string,
    name: string | undefined,
    estimate: EstimateSummary,
  ): Promise<boolean> {
    return this.send(to, 'estimate', {
      subject: `Your ${estimate.projectTypeTitle} estimate — Weblaud`,
      template: 'estimate-summary',
      context: {
        ...this.baseContext(name),
        projectTypeTitle: estimate.projectTypeTitle,
        featureTitles: estimate.featureTitles,
        speedLabel: estimate.speedLabel,
        totalWeeks: estimate.totalWeeks,
        costRange: `${money(estimate.costMin)} – ${money(estimate.costMax)}`,
      },
    });
  }

  /**
   * The full website-audit report the visitor traded their email for. The
   * host is the only visitor-influenced value besides the name — it went
   * through normalizeAuditUrl() and Google loaded it, and the template prints
   * it as plain text, never a link.
   */
  sendAuditReport(
    to: string,
    name: string | undefined,
    report: AuditReport,
  ): Promise<boolean> {
    const { scores, vitals } = report;
    const scoreRows = (
      [
        ['Performance', scores.performance],
        ['SEO', scores.seo],
        ['Accessibility', scores.accessibility],
        ['Best practices', scores.bestPractices],
      ] as const
    ).map(([label, score]) => ({ label, score, ...scoreStatus(score) }));

    return this.send(to, 'audit', {
      subject: 'Your website audit report — Weblaud',
      template: 'audit-report',
      context: {
        ...this.baseContext(name),
        host: report.host,
        device: report.strategy === 'desktop' ? 'desktop' : 'mobile',
        scores: scoreRows,
        vitals: [
          {
            label: 'Largest Contentful Paint',
            value: seconds(vitals.lcpMs),
            good: '≤ 2.5 s',
          },
          {
            label: 'Total Blocking Time',
            value: ms(vitals.tbtMs),
            good: '≤ 200 ms',
          },
          {
            label: 'Cumulative Layout Shift',
            value: vitals.cls?.toFixed(2),
            good: '≤ 0.1',
          },
          {
            label: 'First Contentful Paint',
            value: seconds(vitals.fcpMs),
            good: '≤ 1.8 s',
          },
        ].filter((v) => v.value !== undefined),
        issueCount: report.issues.length,
        topIssues: report.issues.slice(0, 5).map((issue) => ({
          title: issue.title,
          detail: [
            issue.displayValue,
            issue.savingsMs
              ? `could save ~${seconds(issue.savingsMs)}`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
        moreIssues: moreIssuesLabel(report.issues.length - 5),
      },
    });
  }

  private baseContext(name?: string) {
    const portalBase = this.config.get<string>('portal.baseUrl');
    return {
      name: greetingName(name),
      bookingUrl: this.config.get<string>('booking.url'),
      // Omitted (and the template drops the line) when PORTAL_URL is unset.
      calculatorUrl: siteUrl(portalBase, '/calculator'),
      projectsUrl: siteUrl(portalBase, '/projects'),
    };
  }

  private async send(
    to: string,
    kind: string,
    message: { subject: string; template: string; context: object },
  ): Promise<boolean> {
    try {
      await this.mail.sendEmail({
        to,
        ...message,
        // MAIL_FROM is usually a no-reply address; a lead answering the
        // auto-reply must land in the inbox that works the leads.
        replyTo: this.config.get<string>('mail.admin'),
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Lead auto-reply (${kind}) failed`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }
}
