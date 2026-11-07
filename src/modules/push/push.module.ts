import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import {
  PushSubscriptionRecord,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionRecord.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
