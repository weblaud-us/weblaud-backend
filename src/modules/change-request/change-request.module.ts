import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChangeRequestController } from './change-request.controller';
import { PortalChangeRequestController } from './portal-change-request.controller';
import { AdminChangeRequestController } from './admin-change-request.controller';
import { ChangeRequestService } from './change-request.service';
import {
  ChangeRequest,
  ChangeRequestSchema,
} from './schemas/change-request.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChangeRequest.name, schema: ChangeRequestSchema },
    ]),
    ClientProjectModule,
    NotificationModule,
    AuditLogModule,
    InvoiceModule,
  ],
  controllers: [
    ChangeRequestController,
    PortalChangeRequestController,
    AdminChangeRequestController,
  ],
  providers: [ChangeRequestService],
  exports: [ChangeRequestService],
})
export class ChangeRequestModule {}
