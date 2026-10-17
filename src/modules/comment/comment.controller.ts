import { Controller, Delete, Param, Req } from '@nestjs/common';
import { CommentService } from './comment.service';

/** Flat, id-addressed comment delete — author or the project's PM/admin only. */
@Controller('portal/comments')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
