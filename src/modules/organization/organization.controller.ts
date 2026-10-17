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
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * Agency-side CRUD for client organizations (companies). Portal-side reads
 * of a client's own organization live on PortalController, not here — this
 * controller is admin-only end to end.
 */
@Controller('organizations')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto, @Req() req) {
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
    @Body() dto: UpdateOrganizationDto,
    @Req() req,
  ) {
    return this.service.update(id, dto, req.user._id.toString());
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req) {
    return this.service.delete(id, req.user._id.toString());
  }
}
