import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/** One label/value line in the details table of a dashboard alert. */
export interface DashboardAlertRow {
  label: string;
  /**
   * Rendered HTML-escaped. Arrays are joined with ", ". Rows whose value is
   * null/undefined/blank/an empty array are dropped, which is why call sites
   * can list optional fields unconditionally instead of hand-rolling
   * `{{#if company}}` branches into a template.
   */
  value?: string | number | string[] | null;
  /** Turns the value into a link — mailto:, tel:, or an https: URL. */
  href?: string;
  /** Optional group heading. Consecutive rows sharing one are grouped under it. */
  section?: string;
}

export interface DashboardAlertInput {
  /** Lowercase noun phrase, e.g. "contact message". Drives subject + heading. */
  kind: string;
  /** Overrides the default heading of `New ${kind}`. */
  heading?: string;
  /** Optional paragraph above the table, e.g. to flag an incomplete record. */
  intro?: string;
  rows: DashboardAlertRow[];
  /**
   * Leaf route only, e.g. "/contact-submissions" — it is appended to
   * ADMIN_BASE_URL, which already carries the admin path prefix.
   */
  dashboardPath: string;
  recordId?: string;
  /** Defaults to `mail.admin`. */
  to?: string;
}

interface RenderedRow {
  label: string;
  value: string;
  href?: string;
}

interface RenderedSection {
  title?: string;
  rows: RenderedRow[];
}

/**
 * Single entry point for "something new landed in the admin dashboard" email.
 *
 * Every visitor-originated record funnels through here so the notifications
 * stay consistent and adding a new source is one call rather than a new
 * template plus a new copy of the try/catch below.
 */
@Injectable()
export class DashboardNotifierService {
  private readonly logger = new Logger(DashboardNotifierService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Never rejects. The caller has already persisted the record, and a mail
   * outage must not turn a saved lead into a 500 for the visitor. Owning the
   * guard here rather than at each call site means a new source cannot forget
   * it.
   */
  async notifyNew(input: DashboardAlertInput): Promise<void> {
    try {
      const to = input.to || this.config.get<string>('mail.admin');

      if (!to) {
        this.logger.error(
          `No recipient configured for ${input.kind} notification — check MAIL_ADMIN`,
        );
        return;
      }

      await this.mailService.sendEmail({
        to,
        subject: `New ${input.kind} — WebLaud dashboard`,
        template: 'dashboard-alert',
        context: {
          heading: input.heading || `New ${input.kind}`,
          intro: input.intro,
          sections: this.buildSections(input.rows),
          dashboardUrl: this.buildUrl(input.dashboardPath),
          // Stamped centrally so no call site can leave the footer reading
          // "Received at " with nothing after it, as the old per-service
          // templates could.
          receivedAt: new Date().toUTCString(),
          recordId: input.recordId,
        },
      });
    } catch (err) {
      this.logger.error(
        `Dashboard notification for ${input.kind} ${input.recordId ?? '(no id)'} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * The one place trailing slashes are reconciled. Returns '' when
   * ADMIN_BASE_URL is unset so the template drops the CTA block entirely
   * rather than rendering a link to "undefined/contact-submissions".
   */
  private buildUrl(dashboardPath: string): string {
    const base = (this.config.get<string>('admin.baseUrl') ?? '')
      .trim()
      .replace(/\/+$/, '');

    if (!base) return '';

    return `${base}${dashboardPath.startsWith('/') ? '' : '/'}${dashboardPath}`;
  }

  private buildSections(rows: DashboardAlertRow[]): RenderedSection[] {
    const sections: RenderedSection[] = [];

    for (const row of rows) {
      const value = this.normalizeValue(row.value);
      if (!value) continue;

      const last = sections[sections.length - 1];

      if (last && last.title === row.section) {
        last.rows.push({ label: row.label, value, href: row.href });
      } else {
        sections.push({
          title: row.section,
          rows: [{ label: row.label, value, href: row.href }],
        });
      }
    }

    return sections;
  }

  private normalizeValue(value: DashboardAlertRow['value']): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(', ');
    }
    return String(value).trim();
  }
}
