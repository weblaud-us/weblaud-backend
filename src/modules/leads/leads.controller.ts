import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/summary')
  summary() {
    return this.leadsService.summary();
  }
}
