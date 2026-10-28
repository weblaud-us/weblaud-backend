import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cover', maxCount: 1 },
      { name: 'details', maxCount: 10 },
    ]),
  )
  create(@Body() dto: CreateProjectDto, @UploadedFiles() files, @Req() req) {
    return this.projectService.create(dto, req.user.id, files);
  }

  // Public reads return published (illustrative/verified) records only, with
  // internal evidence notes stripped. Drafts 404.
  @Public()
  @Get()
  findAll() {
    return this.projectService.findAllPublic();
  }

  // Declared before `:id` so "admin" is never read as a project id.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAllAdmin() {
    return this.projectService.findAllAdmin();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.projectService.findOneAdmin(id);
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.projectService.findPublicBySlug(slug);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findPublicById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cover', maxCount: 1 },
      { name: 'details', maxCount: 10 },
    ]),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @UploadedFiles() files,
    @Req() req,
  ) {
    return this.projectService.update(id, dto, req.user.id, files);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.projectService.delete(id);
  }
}
