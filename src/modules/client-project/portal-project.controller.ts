import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ClientProjectService } from './client-project.service';
import { PortalUpdateProjectDto } from './dto/portal-update-project.dto';

/**
 * Client/staff-facing reads and PM-scoped writes. No @Roles here — everyone
 * who's logged in (client, PM, team member, admin) can hit these; which
 * projects they actually see (and, for PATCH, who's allowed to edit) is
 * decided per-request by membership/PM-status in ClientProjectService
 * (assertProjectAccess / assertProjectManager), not by a coarse role check.
 * The global JwtAuthGuard already requires a valid session, so no further
 * guard is needed here.
 */
@Controller('portal/projects')
export class PortalProjectController {
  constructor(private readonly service: ClientProjectService) {}

  @Get()
  findMine(@Req() req) {
    return this.service.findForPortalUser(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.service.findOneForPortalUser(id, req.user);
  }

  /** PM (or admin) only — see PortalUpdateProjectDto and assertProjectManager. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PortalUpdateProjectDto,
    @Req() req,
  ) {
    return this.service.updateForPortalUser(id, dto, req.user);
  }
}
