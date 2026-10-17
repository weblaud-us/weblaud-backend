import {
  BadRequestException,
  Controller,
  Post,
  Param,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller()
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Post('portal/invoices/:id/checkout')
  createCheckout(@Param('id') id: string, @Req() req) {
    return this.service.createCheckoutSession(id, req.user);
  }

  /**
   * Stripe calls this unauthenticated (no user session — it authenticates
   * via the signature instead), so it must be @Public(). Needs the exact
   * raw request bytes to verify that signature — see main.ts's
   * `rawBody: true`, which is what populates `req.rawBody` here.
   */
  @Post('payments/webhook')
  @Public()
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string' || !req.rawBody) {
      throw new BadRequestException('Missing Stripe signature or raw body');
    }

    let event;
    try {
      event = this.service.verifyAndParseEvent(req.rawBody, signature);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.service.handleEvent(event);
    return { received: true };
  }
}
