import { Controller, Get, UseGuards } from '@nestjs/common';
import { ChangeRequestService } from './change-request.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * Read-only cross-project view for the agency side — every change request,
 * not just one project's. Genuinely read-only: only a client_admin can
 * approve/reject one (see ChangeRequestService.assertCanDecide), so there
 * is no admin decision action to expose here, only visibility into what's
 * awaiting a client.
 */
@Controller('change-requests')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminChangeRequestController {
  constructor(private readonly service: ChangeRequestService) {}

  @Get()
  findAll() {
    return this.service.findAllForAdmin();
  }
}
