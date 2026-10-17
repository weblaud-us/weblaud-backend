import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { InvoiceType } from '../schemas/invoice.schema';
import { LineItemDto } from './line-item.dto';

export class CreateInvoiceDto {
  @IsNotEmpty()
  @IsMongoId()
  organization: string;

  @IsNotEmpty()
  @IsMongoId()
  project: string;

  @IsOptional()
  @IsEnum(InvoiceType)
  type?: InvoiceType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNotEmpty()
  @IsDateString()
  issueDate: string;

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @ValidateIf((o) => o.recurring === true)
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  recurrenceIntervalDays?: number;
}
