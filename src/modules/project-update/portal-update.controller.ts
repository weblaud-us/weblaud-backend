import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ProjectUpdateService } from './project-update.service';
import { EditProjectUpdateDto } from './dto/edit-project-update.dto';
import { RejectProjectUpdateDto } from './dto/reject-project-update.dto';

/** Flat, id-addressed operations on a single update — edit/approve/reject — plus the PM's cross-project review queue. */
@Controller('portal/updates')
export class PortalUpdateController {
  constructor(private readonly service: ProjectUpdateService) {}

  // Before ':id' below only matters if a future GET ':id' is added — kept
  // here anyway since this is conceptually a sibling list endpoint, not a
  // single-update lookup.
  @Get('review-queue')
  reviewQueue(@Req() req) {
    return this.service.reviewQueue(req.user);
  }

  @Patch(':id')
  editOwn(
    @Param('id') id: string,
    @Body() dto: EditProjectUpdateDto,
    @Req() req,
  ) {
    return this.service.editOwn(id, dto, req.user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req) {
    return this.service.approve(id, req.user);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectProjectUpdateDto,
    @Req() req,
  ) {
    return this.service.reject(id, dto, req.user);
  }
}
