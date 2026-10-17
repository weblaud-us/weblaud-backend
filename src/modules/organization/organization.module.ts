import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
