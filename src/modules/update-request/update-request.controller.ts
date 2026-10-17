import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { UpdateRequestService } from './update-request.service';
import { CreateUpdateRequestDto } from './dto/create-update-request.dto';

@Controller('portal/projects/:projectId/update-requests')
export class UpdateRequestController {
  constructor(private readonly service: UpdateRequestService) {}

  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateUpdateRequestDto,
    @Req() req,
  ) {
    return this.service.create(projectId, dto, req.user);
  }

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
