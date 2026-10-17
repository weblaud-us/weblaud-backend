import { Controller, Get, Req } from '@nestjs/common';
import { PortalDashboardService } from './portal-dashboard.service';

/** Everything a client/staff user needs to see up front — no @Roles, scoped per-user by the underlying services. */
@Controller('portal/dashboard')
export class PortalDashboardController {
  constructor(private readonly service: PortalDashboardService) {}

  @Get('attention')
  attention(@Req() req) {
    return this.service.attentionSummary(req.user);
  }
}
