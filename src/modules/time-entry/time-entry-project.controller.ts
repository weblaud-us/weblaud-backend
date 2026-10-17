import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TimeEntryService } from './time-entry.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/** Nested under a project: log/list time entries. Staff-only — a client never has a reason to see hours or (indirectly, via a rate) cost. */
@Controller('portal/projects/:projectId/time-entries')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class TimeEntryProjectController {
  constructor(private readonly service: TimeEntryService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTimeEntryDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }
}
