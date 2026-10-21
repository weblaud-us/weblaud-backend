import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PortalDashboardController } from './portal-dashboard.controller';
import { PortalDashboardService } from './portal-dashboard.service';
import { ProjectActivityService } from './project-activity.service';
import {
  ProjectUpdate,
  ProjectUpdateSchema,
} from 'src/modules/project-update/schemas/project-update.schema';
import {
  ProjectFile,
  ProjectFileSchema,
} from 'src/modules/file/schemas/project-file.schema';
import {
  Approval,
  ApprovalSchema,
} from 'src/modules/approval/schemas/approval.schema';
import {
  Invoice,
  InvoiceSchema,
} from 'src/modules/invoice/schemas/invoice.schema';
import {
  Comment,
  CommentSchema,
} from 'src/modules/comment/schemas/comment.schema';
import {
  Contract,
  ContractSchema,
} from 'src/modules/contract/schemas/contract.schema';
import {
  ChangeRequest,
  ChangeRequestSchema,
} from 'src/modules/change-request/schemas/change-request.schema';
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
    // Read-only models for ProjectActivityService's recent-activity merge.
    MongooseModule.forFeature([
      { name: ProjectUpdate.name, schema: ProjectUpdateSchema },
      { name: ProjectFile.name, schema: ProjectFileSchema },
      { name: Approval.name, schema: ApprovalSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: ChangeRequest.name, schema: ChangeRequestSchema },
    ]),
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
  providers: [PortalDashboardService, ProjectActivityService],
  exports: [PortalDashboardService],
})
export class DashboardModule {}
