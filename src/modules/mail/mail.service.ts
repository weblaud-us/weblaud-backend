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
    this.logger.log('MailService initialized');
    
    // Log transporter events
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Error verifying mail transporter:', error);
      } else {
        this.logger.log('Mail transporter is ready to take our messages');
      }
    });
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
  }) {
    const html = options.template
      ? this.compileTemplate(options.template, options.context)
      : options.html;

    return this.transporter.sendMail({
      to: options.to,
      subject: options.subject,
      html,
      from: this.config.get('mail.from'),
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
}
