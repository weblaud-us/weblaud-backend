import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  Res,
  Req,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { Response, Express } from 'express';
import { CareerService } from './career.service';
import { CreateCareerDto } from './dto/create-career.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enum/user.role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('careers')
export class CareerController {
  constructor(private readonly service: CareerService) {}

  // --- GOOGLE LOGIN START ---
  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google-career'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google-career'))
  async googleCallback(@Req() req) {
    // req.user contains Google profile mapped by strategy
    return this.service.handleGoogleApplicant(req.user);
  }
  // --- GOOGLE LOGIN END ---

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

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getCareer(id);
  }

  // -------- APPLICATION FLOW --------
  // Public, unauthenticated write that accepts a file upload — tightened well
  // below the global default. Size and type are enforced by multer.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post(':id/apply')
  @UseInterceptors(FileInterceptor('resume'))
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

