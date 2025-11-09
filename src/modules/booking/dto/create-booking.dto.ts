import { IsEmail, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @IsNotEmpty()
  @IsString()
  customerName: string;

  @IsNotEmpty()
  @IsEmail()
  customerEmail: string;

  @IsNotEmpty()
  @IsISO8601()
  start: string; // ISO string

  @IsNotEmpty()
  @IsISO8601()
  end: string; // ISO string

  @IsOptional()
  @IsString()
  notes?: string;

  // Optional idempotency key to avoid double booking
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
