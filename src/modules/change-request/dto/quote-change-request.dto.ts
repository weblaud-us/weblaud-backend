import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** A PM pricing a client-requested change (requested → quoted). See ChangeRequestService.quote. */
export class QuoteChangeRequestDto {
  @IsNumber()
  @Min(0)
  priceAmount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
