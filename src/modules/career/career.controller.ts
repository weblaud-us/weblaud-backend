import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  Res,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { buildFileFilter } from '@weblaud/upload-pro';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { Response, Express } from 'express';
import { CareerService } from './career.service';
import { CreateCareerDto } from './dto/create-career.dto';
import { UpdateCareerDto } from './dto/update-career.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enum/user.role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';

const RESUME_TYPES = ['pdf', 'doc', 'docx'];
const RESUME_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Reuses upload-pro's extension/mime cross-check but re-raises the rejection
 * using *this* package's BadRequestException. upload-pro is linked in with its
 * own copy of @nestjs/common, so the exception it constructs fails the
 * `instanceof HttpException` check in our exception filter and a plain bad file
 * type would otherwise surface as a 500 instead of a 400.
 */
const resumeFileFilter: MulterOptions['fileFilter'] = (req, file, callback) => {
  buildFileFilter(RESUME_TYPES)(req, file, (error, acceptFile) => {
    if (error) {
      return callback(new BadRequestException(error.message), false);
    }
    callback(null, acceptFile ?? false);
  });
};

@Controller('careers')
export class CareerController {
  constructor(private readonly service: CareerService) {}

  // -------- JOBS --------
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCareerDto) {
    return this.service.createCareer(dto);
  }

  @Public()
  @Get()
  list() {
    return this.service.listCareers();
  }

  // Must stay above @Get(':id') — Nest matches in declaration order, so the
  // wildcard route would otherwise swallow "slug" as an id.
  @Public()
  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.getCareerBySlug(slug);
  }

  // Same ordering constraint: below @Get(':id') this would resolve as
  // getCareer('admin') and 404.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAllAdmin(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.findAllAdmin(page, limit);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getCareer(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCareerDto) {
    return this.service.updateCareer(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.deleteCareer(id);
  }

  // -------- APPLICATION FLOW --------
  // Public, unauthenticated write that accepts a file upload — tightened well
  // below the global default. `fileFilter` is the only hook that runs before
  // multer starts buffering bytes, so the resume type/size check has to live
  // here; UploadService.upload() does no validation of its own, and no
  // MulterModule is registered globally to supply a default.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post(':id/apply')
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: RESUME_MAX_BYTES, files: 1, fields: 20 },
      fileFilter: resumeFileFilter,
    }),
  )
  apply(
    @Param('id') id: string,
    @Body() dto: SubmitApplicationDto,
    @UploadedFile() resume: Express.Multer.File,
  ) {
    if (!resume) throw new BadRequestException('Resume upload is required');
    return this.service.submitApplication(id, dto, resume);
  }

  // Admin-only: an application carries the applicant's name, email, phone and
  // resume URL. Without the role check the global JwtAuthGuard admits any
  // authenticated principal, which meant any self-registered account could
  // enumerate every applicant by id.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('applications/:id')
  getApp(@Param('id') id: string) {
    return this.service.getApplication(id);
  }

  // -------- ADMIN: VIEW APPLICANTS --------
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/applicants/export/csv')
  async exportCsv(@Query() query: any, @Res() res: Response) {
    const data = await this.service.listApplicantsRaw(query);
    return this.service.exportCsv(data, res);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/applicants')
  listApplicants(@Query() query: any) {
    return this.service.listApplicants(query);
  }
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/applicants/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }
}

