import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';

/** General, project-level discussion thread — no specific task/file attached. */
@Controller('portal/projects/:projectId/comments')
export class CommentProjectController {
  constructor(private readonly service: CommentService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateCommentDto,
    @Req() req,
  ) {
    return this.service.createForProject(projectId, dto, req.user);
  }
}
