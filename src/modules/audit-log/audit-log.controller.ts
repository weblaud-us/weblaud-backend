import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Controller('audit-log')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  findRecent(@Query('limit') limit?: number) {
    return this.service.findRecent(limit ? Number(limit) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':entityType/:entityId')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.findForEntity(entityType, entityId);
  }
}
