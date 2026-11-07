import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as hbs from 'handlebars';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject('MAIL_TRANSPORTER') private transporter: Transporter,
    private config: ConfigService,
  ) {
    // No verify() here: MailModule's transporter factory already does it once.
    // Doing it again opened a second SMTP connection on every boot, and Gmail
    // rate-limits connection attempts.
    this.logger.log('MailService initialized');
  }

  private readonly templateCache = new Map<string, hbs.TemplateDelegate>();

  /**
   * Templates are resolved relative to this file, not process.cwd(). They are
   * copied into dist/ by the `assets` entry in nest-cli.json, so this works
   * identically whether we're running compiled output or ts-jest — and no
   * longer depends on the deploy happening to ship the src/ tree alongside it.
   */
  private compileTemplate(templateName: string, context: any) {
    let template = this.templateCache.get(templateName);

    if (!template) {
      const templatePath = path.join(
        __dirname,
        'templates',
        `${templateName}.hbs`,
      );

      if (!fs.existsSync(templatePath)) {
        throw new Error(
          `Email template "${templateName}" not found at ${templatePath}. ` +
            'Check the "assets" entry in nest-cli.json.',
        );
      }

      template = hbs.compile(fs.readFileSync(templatePath, 'utf-8'));
      this.templateCache.set(templateName, template);
    }

    return template(context);
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    template?: string;
    context?: any;
    html?: string;
    /** Where a reply should go when `from` is a no-reply address. */
    replyTo?: string;
  }) {
    const html = options.template
      ? this.compileTemplate(options.template, options.context)
      : options.html;

    // SMTP latency is the one part of a request we cannot see from the outside
    // and cannot reproduce locally, so every send is timed. `label` is the
    // template name (or "raw") rather than the recipient — addresses do not
    // belong in logs.
    const label = options.template ?? 'raw';
    const startedAt = Date.now();

    try {
      const info = await this.transporter.sendMail({
        to: options.to,
        subject: options.subject,
        html,
        from: this.config.get('mail.from'),
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      });

      // Optional chaining because a logging detail must never be what fails a
      // send: a stubbed transporter (and some SMTP servers on a 250 with no
      // queue id) resolves without a messageId.
      this.logger.log(
        `Sent "${label}" in ${Date.now() - startedAt}ms (messageId=${info?.messageId ?? 'n/a'})`,
      );
      return info;
    } catch (err) {
      this.logger.error(
        `Failed to send "${label}" after ${Date.now() - startedAt}ms: ${
          (err as Error).message
        }`,
      );
      throw err;
    }
  }

  /**
   * Sends without making the caller wait, for mail that must not hold up an
   * HTTP response (invites, notifications). The returned promise is already
   * settled — failures are logged here and never propagate, because an
   * unhandled rejection from a detached send would take the process down.
   *
   * Only use this where the caller has already committed the state the mail
   * describes, and where a failed send is recoverable by other means (an
   * admin re-sending an invite). Anything the user is told succeeded *because*
   * the mail went out should still await sendEmail.
   */
  sendEmailInBackground(
    options: Parameters<MailService['sendEmail']>[0],
  ): void {
    void this.sendEmail(options).catch(() => {
      // sendEmail already logged the failure with timing and template name.
    });
  }

  async sendOtpEmail(email: string, otp: string) {
    return this.sendEmail({
      to: email,
      subject: 'Your OTP Code',
      template: 'otp',
      context: { otp },
    });
  }

  private inviteEmail(options: {
    to: string;
    firstName: string;
    acceptUrl: string;
    ttlHours: number;
    inviterOrg?: string;
  }) {
    return {
      to: options.to,
      subject: 'You are invited to the WebLaud Portal',
      template: 'invite',
      context: {
        firstName: options.firstName,
        acceptUrl: options.acceptUrl,
        ttlHours: options.ttlHours,
        inviterOrg: options.inviterOrg,
      },
    };
  }

  async sendInviteEmail(options: {
    to: string;
    firstName: string;
    acceptUrl: string;
    ttlHours: number;
    inviterOrg?: string;
  }) {
    return this.sendEmail(this.inviteEmail(options));
  }

  /**
   * The invite token is already persisted by the time this is called, so the
   * invite is valid whether or not the mail lands — an admin can always hit
   * "Resend invite". See sendEmailInBackground.
   */
  sendInviteEmailInBackground(options: {
    to: string;
    firstName: string;
    acceptUrl: string;
    ttlHours: number;
    inviterOrg?: string;
  }): void {
    this.sendEmailInBackground(this.inviteEmail(options));
  }
}
