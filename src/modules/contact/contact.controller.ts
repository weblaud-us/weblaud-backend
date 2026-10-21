import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { CaptchaGuard } from 'src/common/guards/captcha.guard';
import { UpdateLeadPipelineDto } from '../leads/dto/update-lead-pipeline.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // Public write that triggers an outbound email per request — tightened well
  // below the global default so it cannot be used to exhaust the sending quota.
  // CaptchaGuard is the actual spam barrier (see its doc comment); content
  // rules in ContactService.submit catch what gets past it.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(CaptchaGuard)
  @Post('submit')
  submit(@Body() dto: CreateContactDto) {
    return this.contactService.submit(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
  ) {
    return this.contactService.findAll(page, limit, status, stage);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/:id')
  getOneAdmin(@Param('id') id: string) {
    return this.contactService.findOneForAdmin(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/pipeline')
  updatePipeline(@Param('id') id: string, @Body() dto: UpdateLeadPipelineDto) {
    return this.contactService.updatePipeline(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/read')
  markRead(@Param('id') id: string) {
    return this.contactService.markRead(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/not-spam')
  markNotSpam(@Param('id') id: string) {
    return this.contactService.markNotSpam(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.contactService.delete(id);
  }
}
