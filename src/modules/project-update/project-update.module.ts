import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectUpdateController } from './project-update.controller';
import { PortalUpdateController } from './portal-update.controller';
import { ProjectUpdateService } from './project-update.service';
import {
  ProjectUpdate,
  ProjectUpdateSchema,
} from './schemas/project-update.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectUpdate.name, schema: ProjectUpdateSchema },
    ]),
    ClientProjectModule,
    NotificationModule,
    AuditLogModule,
  ],
  controllers: [ProjectUpdateController, PortalUpdateController],
  providers: [ProjectUpdateService],
  exports: [ProjectUpdateService],
})
export class ProjectUpdateModule {}
