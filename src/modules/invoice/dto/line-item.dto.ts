import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class LineItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}
