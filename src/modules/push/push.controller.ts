import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PushService } from './push.service';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';

/**
 * Portal push-notification subscriptions. Like the notification center, every
 * logged-in user manages only their own devices — scoped by req.user._id.
 */
@Controller('portal/push')
export class PushController {
  constructor(private readonly service: PushService) {}

  @Get('public-key')
  publicKey() {
    return { publicKey: this.service.publicKey() };
  }

  @Post('subscribe')
  subscribe(@Req() req, @Body() dto: SubscribePushDto) {
    return this.service.subscribe(req.user._id.toString(), dto);
  }

  @Post('unsubscribe')
  unsubscribe(@Req() req, @Body() dto: UnsubscribePushDto) {
    return this.service.unsubscribe(req.user._id.toString(), dto.endpoint);
  }
}
