import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ChangeRequestService } from './change-request.service';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import { QuoteChangeRequestDto } from './dto/quote-change-request.dto';

/** Flat, id-addressed decisions on a single change request — approve/reject/mark-invoiced/quote. */
@Controller('portal/change-requests')
export class PortalChangeRequestController {
  constructor(private readonly service: ChangeRequestService) {}

  /** PM prices a client-requested change (requested → quoted). See ChangeRequestService.quote. */
  @Post(':id/quote')
  quote(
    @Param('id') id: string,
    @Body() dto: QuoteChangeRequestDto,
    @Req() req,
  ) {
    return this.service.quote(id, dto, req.user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req) {
    return this.service.approve(id, req.user);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectChangeRequestDto,
    @Req() req,
  ) {
    return this.service.reject(id, dto, req.user);
  }

  @Post(':id/mark-invoiced')
  markInvoiced(@Param('id') id: string, @Req() req) {
    return this.service.markInvoiced(id, req.user);
  }
}
