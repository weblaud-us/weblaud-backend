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
import { Throttle } from '@nestjs/throttler';
import { AuditsService } from './audits.service';
import { RunAuditDto } from './dto/run-audit.dto';
import { ClaimAuditDto } from './dto/claim-audit.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { CaptchaGuard } from 'src/common/guards/captcha.guard';
import { UpdateLeadPipelineDto } from '../leads/dto/update-lead-pipeline.dto';

@Controller('audits')
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  // --- Admin (declared before the public :id route so "admin" isn't read as an id) ---

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('stage') stage?: string,
  ) {
    return this.auditsService.findAll(page, limit, status, stage);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/read')
  markRead(@Param('id') id: string) {
    return this.auditsService.markRead(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/pipeline')
  updatePipeline(@Param('id') id: string, @Body() dto: UpdateLeadPipelineDto) {
    return this.auditsService.updatePipeline(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.auditsService.delete(id);
  }

  // --- Public tool ---

  // Each run spends PageSpeed API quota, so it sits behind the captcha and a
  // tight per-IP limit.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(CaptchaGuard)
  @Post('run')
  run(@Body() dto: RunAuditDto) {
    return this.auditsService.run(dto);
  }

  // Polled every few seconds while an audit runs; reveals scores only.
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.auditsService.getPublic(id);
  }

  // Sends an email to the given address — captcha plus a tight limit, like
  // the contact form.
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(CaptchaGuard)
  @Post(':id/claim')
  claim(@Param('id') id: string, @Body() dto: ClaimAuditDto) {
    return this.auditsService.claim(id, dto);
  }
}
