import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { ReplaceFeaturesDto } from './dto/replace-features.dto';

/** Nested under a project — every project member can read, only the PM (or admin) can replace the list. See FeatureService.replaceForProject. */
@Controller('portal/projects/:projectId/features')
export class FeatureController {
  constructor(private readonly service: FeatureService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }

  @Put()
  replace(
    @Param('projectId') projectId: string,
    @Body() dto: ReplaceFeaturesDto,
    @Req() req,
  ) {
    return this.service.replaceForProject(projectId, dto, req.user);
  }
}
