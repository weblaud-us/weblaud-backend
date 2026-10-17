import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceController } from './invoice.controller';
import { PortalInvoiceController } from './portal-invoice.controller';
import { InvoiceProjectController } from './invoice-project.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceSchedulerService } from './invoice-scheduler.service';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import {
  Payment,
  PaymentSchema,
} from 'src/modules/payment/schemas/payment.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from 'src/modules/time-entry/schemas/time-entry.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { UsersModule } from 'src/modules/users/users.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';
import { CounterModule } from 'src/modules/counter/counter.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      // Schema only, not PaymentModule — PaymentModule already imports
      // InvoiceModule (PaymentService depends on InvoiceService), so
      // importing it back here would be circular. Registering just the
      // schema lets InvoiceService write/read the Payment ledger (manual
      // settlements, Σ-payments status derivation) without that cycle.
      { name: Payment.name, schema: PaymentSchema },
      // Same reasoning, same shape — TimeEntryModule already imports
      // InvoiceModule (TimeEntryService.generateInvoice depends on
      // InvoiceService), so importing TimeEntryModule back here would be
      // circular. Schema-only registration lets InvoiceService unlock any
      // time entries billed to an invoice that's later voided/deleted (see
      // void()/delete() below) without that cycle.
      { name: TimeEntry.name, schema: TimeEntrySchema },
    ]),
    ClientProjectModule,
    UsersModule,
    NotificationModule,
    AuditLogModule,
    CounterModule,
  ],
  controllers: [
    InvoiceController,
    PortalInvoiceController,
    InvoiceProjectController,
  ],
  providers: [InvoiceService, InvoiceSchedulerService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
