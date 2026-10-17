import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalTeamService } from './portal-team.service';
import { PortalInviteDto, UpdateTeamMemberDto } from './dto/portal-team.dto';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A client organization's own people. No @Roles: PortalTeamService checks
 * that the caller is a client (and a client_admin for any change) and
 * scopes every query to their organization.
 */
@Controller('portal/team')
export class PortalTeamController {
  constructor(private readonly team: PortalTeamService) {}

  @Get()
  list(@Req() req) {
    return this.team.list(req.user);
  }

  /** Each invite sends a real email — capped so a compromised account can't spray them. */
  @Throttle({ default: { limit: 10, ttl: HOUR_MS } })
  @Post('invite')
  invite(@Body() dto: PortalInviteDto, @Req() req) {
    return this.team.invite(req.user, dto);
  }

  @Throttle({ default: { limit: 10, ttl: HOUR_MS } })
  @Post(':id/resend-invite')
  resendInvite(@Param('id') id: string, @Req() req) {
    return this.team.resendInvite(req.user, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeamMemberDto, @Req() req) {
    return this.team.update(req.user, id, dto);
  }
}
