import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/** Agency-side CRUD. Admin-only — invoicing is a financial action, never a staff (PM) one. */
@Controller('invoices')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  create(@Body() dto: CreateInvoiceDto, @Req() req) {
    return this.service.create(dto, req.user._id.toString());
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Req() req) {
    return this.service.send(id, req.user._id.toString());
  }

  @Post(':id/mark-paid')
  markPaid(@Param('id') id: string, @Req() req) {
    return this.service.markPaid(id, req.user._id.toString());
  }

  /** Manual settlement recorded as an amount rather than all-or-nothing — see InvoiceService.recordPayment. */
  @Post(':id/record-payment')
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @Req() req,
  ) {
    return this.service.recordPayment(id, dto, req.user._id.toString());
  }

  /** Ledger history — Stripe and manual settlements alike. Was previously unreachable: PaymentController had no read endpoint at all. */
  @Get(':id/payments')
  findPayments(@Param('id') id: string) {
    return this.service.findPayments(id);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @Req() req) {
    return this.service.void(id, req.user._id.toString());
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
