import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';

/** Nested under a project: list/create tasks for it. */
@Controller('portal/projects/:projectId/tasks')
export class TaskProjectController {
  constructor(private readonly service: TaskService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }
}
