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
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { Response, Express } from 'express';
import { CareerService } from './career.service';
import { CreateCareerDto } from './dto/create-career.dto';
import { Step1Dto } from './dto/step1.dto';
import { Step2Dto } from './dto/step2.dto';
import { Step3Dto } from './dto/step3.dto';
import { Step4Dto } from './dto/step4.dto';
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
  @Post(':id/apply/start')
  start(@Param('id') id: string) {
    return this.service.startApplication(id);
  }

  @Get('applications/:id')
  getApp(@Param('id') id: string) {
    return this.service.getApplication(id);
  }

  @Patch('applications/:id/step1')
  @UseInterceptors(FileInterceptor('avatar'))
  step1(
    @Param('id') id: string,
    @UploadedFile() avatar: Express.Multer.File,
    @Body() dto: Step1Dto,
  ) {
    return this.service.saveStep1(id, dto, avatar);
  }

  @Patch('applications/:id/step2')
  step2(@Param('id') id: string, @Body() dto: Step2Dto) {
    return this.service.saveStep2(id, dto);
  }

  @Patch('applications/:id/step3')
  step3(@Param('id') id: string, @Body() dto: Step3Dto) {
    return this.service.saveStep3(id, dto);
  }

  @Patch('applications/:id/step4')
  @UseInterceptors(FileInterceptor('resume'))
  step4(
    @Param('id') id: string,
    @Body() dto: Step4Dto,
    @UploadedFile() resume: Express.Multer.File,
  ) {
    if (!resume) throw new BadRequestException('Resume upload is required');
    return this.service.saveStep4(id, dto, resume);
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
