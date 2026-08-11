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
import { EstimatesService } from './estimates.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Controller('estimates')
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  // Tighter than the global ThrottlerGuard default — this is a public write.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('submit')
  submit(@Body() dto: CreateEstimateDto) {
    return this.estimatesService.submit(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.estimatesService.findAll(page, limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/read')
  markRead(@Param('id') id: string) {
    return this.estimatesService.markRead(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.estimatesService.delete(id);
  }
}
