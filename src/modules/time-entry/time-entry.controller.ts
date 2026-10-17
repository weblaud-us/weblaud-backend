import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TimeEntryService } from './time-entry.service';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { GenerateInvoiceFromTimeDto } from './dto/generate-invoice-from-time.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/** Flat, id-addressed edits/deletes, plus the billing bridge. Staff-only — see TimeEntryProjectController. */
@Controller('portal/time-entries')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class TimeEntryController {
  constructor(private readonly service: TimeEntryService) {}

  /**
   * Must come before ':id' below, or "generate-invoice" would be parsed as
   * an entry id. Admin-only (overrides the class-level ADMIN+MANAGER) — same
   * gate as every other "create an invoice" action (InvoiceController),
   * even though a PM is the one who'd typically initiate this.
   */
  @Roles(Role.ADMIN)
  @Post('generate-invoice')
  generateInvoice(@Body() dto: GenerateInvoiceFromTimeDto, @Req() req) {
    return this.service.generateInvoice(dto, req.user._id.toString());
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTimeEntryDto, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
