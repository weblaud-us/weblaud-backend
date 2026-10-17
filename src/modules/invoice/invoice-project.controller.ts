import { Controller, Get, Param, Req } from '@nestjs/common';
import { InvoiceService } from './invoice.service';

/** Nested under a project: list its invoices. */
@Controller('portal/projects/:projectId/invoices')
export class InvoiceProjectController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }
}
