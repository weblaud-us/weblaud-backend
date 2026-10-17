import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InvoiceService } from './invoice.service';

/**
 * Flat, id-addressed reads across all of a user's invoices — no @Roles;
 * InvoiceService.findForPortalUser/assertAccess decide what's visible.
 * The pay action lives on PaymentController (portal/invoices/:id/checkout)
 * to keep money-movement separate from invoice CRUD/reads.
 */
@Controller('portal/invoices')
export class PortalInvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  findMine(@Req() req) {
    return this.service.findForPortalUser(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.service.findOneForPortalUser(id, req.user);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Req() req, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=invoice-${id}.pdf`);
    await this.service.streamPdf(id, req.user, res);
  }
}
