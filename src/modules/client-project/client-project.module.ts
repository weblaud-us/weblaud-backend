import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientProjectController } from './client-project.controller';
import { PortalProjectController } from './portal-project.controller';
import { ClientProjectService } from './client-project.service';
import {
  ClientProject,
  ClientProjectSchema,
} from './schemas/client-project.schema';
import { UsersModule } from 'src/modules/users/users.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClientProject.name, schema: ClientProjectSchema },
    ]),
    UsersModule,
    NotificationModule,
    AuditLogModule,
  ],
  controllers: [ClientProjectController, PortalProjectController],
  providers: [ClientProjectService],
  exports: [ClientProjectService],
})
export class ClientProjectModule {}
