import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalController } from './approval.controller';
import { PortalApprovalController } from './portal-approval.controller';
import { AdminApprovalController } from './admin-approval.controller';
import { ApprovalService } from './approval.service';
import { Approval, ApprovalSchema } from './schemas/approval.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Approval.name, schema: ApprovalSchema },
    ]),
    ClientProjectModule,
    NotificationModule,
    AuditLogModule,
  ],
  controllers: [
    ApprovalController,
    PortalApprovalController,
    AdminApprovalController,
  ],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
