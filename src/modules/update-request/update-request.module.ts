import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UpdateRequestController } from './update-request.controller';
import { PortalUpdateRequestController } from './portal-update-request.controller';
import { UpdateRequestService } from './update-request.service';
import {
  UpdateRequest,
  UpdateRequestSchema,
} from './schemas/update-request.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UpdateRequest.name, schema: UpdateRequestSchema },
    ]),
    ClientProjectModule,
    NotificationModule,
  ],
  controllers: [UpdateRequestController, PortalUpdateRequestController],
  providers: [UpdateRequestService],
  exports: [UpdateRequestService],
})
export class UpdateRequestModule {}
