import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ClientProjectService } from './client-project.service';
import { CreateClientProjectDto } from './dto/create-client-project.dto';
import { UpdateClientProjectDto } from './dto/update-client-project.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * Agency side — ADMIN only, every route.
 *
 * These endpoints are unscoped: findAll returns every project in every
 * organization, and update accepts organization/projectManager/team/budget.
 * They used to admit MANAGER as well, which let any staff account list every
 * client's projects and PATCH itself onto one (or move one to a different
 * client org), bypassing the per-project membership model that
 * assertProjectAccess enforces everywhere else. Staff work through
 * /portal/projects instead, which is membership-scoped, and PM-level edits go
 * through PATCH /portal/projects/:id (assertProjectManager).
 */
@Controller('client-projects')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class ClientProjectController {
  constructor(private readonly service: ClientProjectService) {}

  @Post()
  create(@Body() dto: CreateClientProjectDto, @Req() req) {
    return this.service.create(dto, req.user._id.toString());
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientProjectDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user._id.toString());
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req) {
    return this.service.delete(id, req.user._id.toString());
  }
}
