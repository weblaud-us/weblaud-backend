import { IsOptional, IsString, MaxLength } from 'class-validator';

// Public, unauthenticated input — capped like every other field on the forms.
export class LeadAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  landingPath?: string;
}
