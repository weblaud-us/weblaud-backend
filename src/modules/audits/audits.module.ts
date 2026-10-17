import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { LeadsModule } from '../leads/leads.module';
import { Audit, AuditSchema } from './schemas/audit.schema';
import { AuditsService } from './audits.service';
import { AuditsController } from './audits.controller';
import { PageSpeedService } from './pagespeed.service';

/** The free website audit tool on /audit — a lead source. */
@Module({
  imports: [
    MailModule,
    LeadsModule,
    MongooseModule.forFeature([{ name: Audit.name, schema: AuditSchema }]),
  ],
  controllers: [AuditsController],
  providers: [AuditsService, PageSpeedService],
})
export class AuditsModule {}
