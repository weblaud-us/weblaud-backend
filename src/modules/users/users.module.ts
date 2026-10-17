import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '@weblaud/upload-pro';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PortalTeamController } from './portal-team.controller';
import { PortalTeamService } from './portal-team.service';
import { User, UserSchema } from './schemas/user.schema';
import { MailModule } from 'src/modules/mail/mail.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';
import { OrganizationModule } from 'src/modules/organization/organization.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MailModule,
    UploadModule,
    AuditLogModule,
    // For the org name in a client admin's invite email. OrganizationModule
    // doesn't import UsersModule, so there's no cycle.
    OrganizationModule,
  ],
  controllers: [UsersController, PortalTeamController],
  providers: [UsersService, PortalTeamService],
  exports: [UsersService],
})
export class UsersModule {}
