import {
  IsString,
  IsBoolean,
  IsOptional,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTestimonialDto {
  @IsString()
  quote: string;

  @IsString()
  authorName: string;

  @IsOptional()
  @IsString()
  authorTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  /** Empty string clears it. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  publicationApproved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  evidenceNote?: string;
}
