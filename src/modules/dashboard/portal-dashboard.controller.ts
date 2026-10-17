import { Controller, Get, Param, Req } from '@nestjs/common';
import { PortalDashboardService } from './portal-dashboard.service';
import { ProjectActivityService } from './project-activity.service';

/** Everything a client/staff user needs to see up front — no @Roles, scoped per-user by the underlying services. */
@Controller('portal')
export class PortalDashboardController {
  constructor(
    private readonly service: PortalDashboardService,
    private readonly activity: ProjectActivityService,
  ) {}

  /** The project's last 10 events, for its Overview. */
  @Get('projects/:projectId/activity')
  projectActivity(@Param('projectId') projectId: string, @Req() req) {
    return this.activity.recent(projectId, req.user);
  }

  @Get('dashboard/attention')
  attention(@Req() req) {
    return this.service.attentionSummary(req.user);
  }

  /** One project's "needs your input" items plus badge counts per tab. */
  @Get('projects/:projectId/attention')
  projectAttention(@Param('projectId') projectId: string, @Req() req) {
    return this.service.projectAttention(projectId, req.user);
  }
}
