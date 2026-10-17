import { Module } from '@nestjs/common';
import { PortalDashboardController } from './portal-dashboard.controller';
import { PortalDashboardService } from './portal-dashboard.service';
import { ContractModule } from 'src/modules/contract/contract.module';
import { ApprovalModule } from 'src/modules/approval/approval.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';

@Module({
  imports: [ContractModule, ApprovalModule, InvoiceModule],
  controllers: [PortalDashboardController],
  providers: [PortalDashboardService],
})
export class DashboardModule {}
