import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceDto } from './create-invoice.dto';

/** No `status` field — status only ever moves through send()/markPaid()/void(), each an audited, notification-firing event of its own. */
export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}
