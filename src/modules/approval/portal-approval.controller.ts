import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';

/** Flat, id-addressed decisions on a single approval — approve/reject — plus the cross-project read `GET /portal/projects/:id/approvals` doesn't cover. */
@Controller('portal/approvals')
export class PortalApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Get()
  findMine(@Req() req) {
    return this.service.findForPortalUser(req.user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: DecideApprovalDto, @Req() req) {
    return this.service.approve(id, dto, req.user);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: DecideApprovalDto, @Req() req) {
    return this.service.reject(id, dto, req.user);
  }
}
