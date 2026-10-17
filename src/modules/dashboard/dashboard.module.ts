import { Module } from '@nestjs/common';
import { PortalDashboardController } from './portal-dashboard.controller';
import { PortalDashboardService } from './portal-dashboard.service';
import { ContractModule } from 'src/modules/contract/contract.module';
import { ApprovalModule } from 'src/modules/approval/approval.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';
import { ChangeRequestModule } from 'src/modules/change-request/change-request.module';
import { UpdateRequestModule } from 'src/modules/update-request/update-request.module';
import { ProjectUpdateModule } from 'src/modules/project-update/project-update.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';

@Module({
  imports: [
    ContractModule,
    ApprovalModule,
    InvoiceModule,
    ChangeRequestModule,
    UpdateRequestModule,
    ProjectUpdateModule,
    NotificationModule,
    ClientProjectModule,
  ],
  controllers: [PortalDashboardController],
  providers: [PortalDashboardService],
  exports: [PortalDashboardService],
})
export class DashboardModule {}
