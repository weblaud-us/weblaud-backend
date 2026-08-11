import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { DashboardNotifierService } from './dashboard-notifier.service';
import * as nodemailer from 'nodemailer';

@Module({
  imports: [ConfigModule],
  providers: [
    MailService,
    DashboardNotifierService,
    {
      provide: 'MAIL_TRANSPORTER',
      useFactory: (config: ConfigService) => {
        const logger = new Logger('MailTransporter');

        const host = config.get<string>('mail.host');
        const port = config.get<number>('mail.port');
        const user = config.get<string>('mail.user');
        const pass = config.get<string>('mail.pass');

        if (!host || !user || !pass) {
          throw new Error(
            '❌ Missing required mail configuration. Please check your .env file',
          );
        }

        const transport = nodemailer.createTransport({
          host,
          port,
          secure: port === 465, // true for 465, false for other ports
          auth: { user, pass },
        });

        // Verified for the log line only — deliberately not awaited and never
        // rethrown. This used to `await transport.verify()` and throw, so a
        // transient SMTP hiccup during a deploy aborted the provider factory,
        // which aborted bootstrap, which took the whole API down over a
        // subsystem that only sends notifications. Real failures still surface
        // at sendMail, where DashboardNotifierService already catches them.
        transport
          .verify()
          .then(() => logger.log('✅ Mail server connection verified'))
          .catch((err: Error) =>
            logger.error(
              `❌ Mail server connection failed (continuing): ${err.message}`,
            ),
          );

        return transport;
      },
      inject: [ConfigService],
    },
  ],
  exports: [MailService, DashboardNotifierService],
})
export class MailModule {}
