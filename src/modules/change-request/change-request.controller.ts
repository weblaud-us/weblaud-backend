import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ChangeRequestService } from './change-request.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RequestChangeRequestDto } from './dto/request-change-request.dto';

/** Nested under a project: raise/list change requests for it. Access is membership + PM-checked per-call in the service. */
@Controller('portal/projects/:projectId/change-requests')
export class ChangeRequestController {
  constructor(private readonly service: ChangeRequestService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateChangeRequestDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }

  /**
   * Kept as its own endpoint rather than folded into POST '' above — a
   * client-initiated (unpriced) request and a PM-priced one have different
   * required fields and different callers, and conflating them into one
   * endpoint with a role-branch would hide that distinction in the DTO
   * instead of the URL. See ChangeRequestService.requestFromClient.
   */
  @Post('request')
  requestScope(
    @Param('projectId') projectId: string,
    @Body() dto: RequestChangeRequestDto,
    @Req() req,
  ) {
    return this.service.requestFromClient(projectId, dto, req.user);
  }

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
