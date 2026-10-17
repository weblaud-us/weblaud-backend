import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';

/** Comments on a single task — staff-only, same as the task board itself. */
@Controller('portal/tasks/:taskId/comments')
export class CommentTaskController {
  constructor(private readonly service: CommentService) {}

  @Get()
  findForTask(@Param('taskId') taskId: string, @Req() req) {
    return this.service.findForTask(taskId, req.user);
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateCommentDto,
    @Req() req,
  ) {
    return this.service.createForTask(taskId, dto, req.user);
  }
}
