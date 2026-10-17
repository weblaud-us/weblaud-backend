import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';
import { MailModule } from 'src/modules/mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    InvoiceModule,
    // Both for PaymentService.flagForRefund: a payment that lands on an
    // already-paid or voided invoice is audited and the admin is emailed.
    AuditLogModule,
    MailModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
