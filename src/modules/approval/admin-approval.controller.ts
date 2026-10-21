import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * Read-only cross-project view for the agency side — every approval, not
 * just one project's. Genuinely read-only: only a client_admin can
 * approve/reject one (see ApprovalService.assertCanDecide), so there is no
 * admin decision action to expose here, only visibility into what's
 * sitting in a client's queue.
 */
@Controller('approvals')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Get()
  findAll() {
    return this.service.findAllForAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOneForAdmin(id);
  }
}
