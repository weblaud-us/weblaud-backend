import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';
import * as hbs from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Module({
  imports: [ConfigModule],
  providers: [
    MailService,
    {
      provide: 'MAIL_TRANSPORTER',
      useFactory: async (config: ConfigService) => {
        const host = config.get('mail.host');
        const port = config.get<number>('mail.port');
        const user = config.get('mail.user');
        const pass = config.get('mail.pass');

        if (!host || !user || !pass) {
          throw new Error('❌ Missing required mail configuration. Please check your .env file');
        }

        const transport = nodemailer.createTransport({
          host,
          port,
          secure: port === 465, // true for 465, false for other ports
          auth: { user, pass },
        });

        // Verify connection configuration
        try {
          await transport.verify();
          console.log('✅ Mail server connection verified');
        } catch (error) {
          console.error('❌ Mail server connection failed:', error.message);
          throw error;
        }

        return transport;
      },
      inject: [ConfigService],
    },
  ],
  exports: [MailService],
})
export class MailModule {}
