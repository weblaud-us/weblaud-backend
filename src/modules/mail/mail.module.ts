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

          // Without `pool`, nodemailer opens a fresh TCP connection and runs a
          // full TLS handshake + AUTH for every single message. Against Gmail
          // that is ~1-3s of pure setup per mail, which is the bulk of the
          // delay an admin feels when inviting someone. Pooling keeps a small
          // number of authenticated connections warm and reuses them.
          pool: true,
          // Gmail is not generous with concurrent connections; 3 is enough to
          // overlap a burst (e.g. inviting several people) without tripping
          // its limits. maxMessages recycles a connection periodically so a
          // long-lived socket going stale can't wedge the pool.
          maxConnections: 3,
          maxMessages: 50,

          // Every one of these is unbounded-ish by default (connection 2min,
          // greeting 30s, socket 10min), so a single unresponsive SMTP server
          // could hang a request for minutes. These cap the worst case at a
          // few seconds, which matters now that sends are also retried by
          // hand rather than blocking the caller.
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
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
