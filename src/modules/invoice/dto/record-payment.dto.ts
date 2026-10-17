import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/** Manual settlement — a bank transfer, a check, cash — recorded by an admin. See InvoiceService.recordPayment. */
export class RecordPaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}
