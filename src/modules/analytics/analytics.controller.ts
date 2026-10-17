import { Controller, Get, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/** Owner-facing rollups (revenue, AR, project health, action queue) — admin-only, same as every other money-shaped endpoint in the agency OS. */
@Controller('analytics')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.service.getOverview();
  }
}
