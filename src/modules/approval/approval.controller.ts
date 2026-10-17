import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { CreateApprovalDto } from './dto/create-approval.dto';

/** Nested under a project: request/list approvals for it. */
@Controller('portal/projects/:projectId/approvals')
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateApprovalDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
