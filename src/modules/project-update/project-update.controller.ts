import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ProjectUpdateService } from './project-update.service';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';

/** Nested under a project: post/list updates for it. Access is membership-checked per-call in the service, not by role here. */
@Controller('portal/projects/:projectId/updates')
export class ProjectUpdateController {
  constructor(private readonly service: ProjectUpdateService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectUpdateDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
