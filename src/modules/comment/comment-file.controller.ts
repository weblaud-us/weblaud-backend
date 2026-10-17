import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';

/** Comments on a single file — a client can only reach one that's visible to them (see CommentService.resolveFileSubject). */
@Controller('portal/files/:fileId/comments')
export class CommentFileController {
  constructor(private readonly service: CommentService) {}

  @Get()
  findForFile(@Param('fileId') fileId: string, @Req() req) {
    return this.service.findForFile(fileId, req.user);
  }

  @Post()
  create(
    @Param('fileId') fileId: string,
    @Body() dto: CreateCommentDto,
    @Req() req,
  ) {
    return this.service.createForFile(fileId, dto, req.user);
  }
}
