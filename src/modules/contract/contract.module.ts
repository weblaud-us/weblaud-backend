import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '@weblaud/upload-pro';
import { ContractController } from './contract.controller';
import { PortalContractController } from './portal-contract.controller';
import { ContractProjectController } from './contract-project.controller';
import { ContractService } from './contract.service';
import { Contract, ContractSchema } from './schemas/contract.schema';
import { UsersModule } from 'src/modules/users/users.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { AuditLogModule } from 'src/modules/audit-log/audit-log.module';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
    ]),
    UploadModule,
    UsersModule,
    NotificationModule,
    AuditLogModule,
    ClientProjectModule,
  ],
  controllers: [
    ContractController,
    PortalContractController,
    ContractProjectController,
  ],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
