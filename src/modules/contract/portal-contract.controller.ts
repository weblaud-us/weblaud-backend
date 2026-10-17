import { Controller, Get, Post, Param, Body, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ContractService } from './contract.service';
import { AcceptContractDto } from './dto/accept-contract.dto';

/**
 * Client/staff-facing reads + the accept action. No @Roles — everyone
 * authenticated can hit these; ContractService.assertAccess decides what
 * they actually see (their own org's contracts, or all of them for admin).
 */
@Controller('portal/contracts')
export class PortalContractController {
  constructor(private readonly service: ContractService) {}

  @Get()
  findMine(@Req() req) {
    return this.service.findForPortalUser(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.service.findOneForPortalUser(id, req.user);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Body() dto: AcceptContractDto, @Req() req) {
    // The signer's own IP/UA as forwarded by the website — not the raw
    // X-Forwarded-For (client-spoofable) or req.ip/User-Agent (the website's
    // server, identical for every acceptance). See client-context.util.ts.
    const ip: string = req.clientIp ?? req.ip ?? '';
    const userAgent: string = req.clientUa ?? req.headers['user-agent'] ?? '';
    return this.service.accept(id, dto, req.user, ip, userAgent);
  }

  /**
   * The uploaded SOW/contract document itself — access-checked and streamed
   * server-side rather than a bare storage URL. See
   * ContractService.streamDocument for why: the raw URL used to be handed
   * straight to the browser with no auth check, no expiry, and no audit
   * trail on the most confidential document in the system.
   */
  @Get(':id/document')
  async document(@Param('id') id: string, @Req() req, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=contract-${id}.pdf`);
    await this.service.streamDocument(id, req.user, res);
  }

  @Get(':id/certificate.pdf')
  async certificate(@Param('id') id: string, @Req() req, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=contract-${id}-certificate.pdf`,
    );
    await this.service.streamAcceptanceCertificate(id, req.user, res);
  }
}
