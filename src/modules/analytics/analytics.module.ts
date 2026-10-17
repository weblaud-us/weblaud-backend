import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import {
  Invoice,
  InvoiceSchema,
} from 'src/modules/invoice/schemas/invoice.schema';
import {
  ClientProject,
  ClientProjectSchema,
} from 'src/modules/client-project/schemas/client-project.schema';
import {
  Contract,
  ContractSchema,
} from 'src/modules/contract/schemas/contract.schema';
import {
  Approval,
  ApprovalSchema,
} from 'src/modules/approval/schemas/approval.schema';
import {
  ChangeRequest,
  ChangeRequestSchema,
} from 'src/modules/change-request/schemas/change-request.schema';
import {
  UpdateRequest,
  UpdateRequestSchema,
} from 'src/modules/update-request/schemas/update-request.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from 'src/modules/time-entry/schemas/time-entry.schema';

/**
 * Schemas registered directly rather than importing InvoiceModule /
 * ClientProjectModule / etc. — AnalyticsService only ever reads (aggregation
 * pipelines, no writes, no notifications, no audit entries), so it has no
 * need for those modules' services or their own dependency graphs. Payment
 * is deliberately absent from this list: AnalyticsService never queries it
 * directly, only reaches it via a $lookup against the raw `payments`
 * collection name inside an Invoice aggregation — see
 * AnalyticsService.computeReceivables.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: ClientProject.name, schema: ClientProjectSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Approval.name, schema: ApprovalSchema },
      { name: ChangeRequest.name, schema: ChangeRequestSchema },
      { name: UpdateRequest.name, schema: UpdateRequestSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
