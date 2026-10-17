import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { Contact, ContactSchema } from '../contact/schemas/contact.schema';
import { Estimate, EstimateSchema } from '../estimates/schemas/estimate.schema';
import { Audit, AuditSchema } from '../audits/schemas/audit.schema';
import { LeadReplyService } from './lead-reply.service';
import { LeadFollowUpService } from './lead-follow-up.service';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

/**
 * Cross-source lead handling. Contact messages, calculator estimates and
 * claimed website audits stay in their own modules/collections; this one owns
 * what they share — the visitor auto-reply, the daily follow-up digest and the
 * dashboard summary. It registers the models itself rather than importing
 * those modules, so they can import this one (for LeadReplyService) without a
 * cycle.
 */
@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: Contact.name, schema: ContactSchema },
      { name: Estimate.name, schema: EstimateSchema },
      { name: Audit.name, schema: AuditSchema },
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadReplyService, LeadFollowUpService, LeadsService],
  exports: [LeadReplyService],
})
export class LeadsModule {}
