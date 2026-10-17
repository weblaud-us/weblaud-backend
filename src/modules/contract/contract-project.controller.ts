import { Controller, Get, Param, Req } from '@nestjs/common';
import { ContractService } from './contract.service';

/** Nested under a project: list the contract(s) linked to it. */
@Controller('portal/projects/:projectId/contracts')
export class ContractProjectController {
  constructor(private readonly service: ContractService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
