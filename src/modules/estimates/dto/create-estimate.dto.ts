import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Note the absence of any price/week field: the estimate is recomputed server
 * side from the live calculator config, so a client cannot dictate the figures
 * we store and email.
 */
export class CreateEstimateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  projectTypeId: string;

  @IsArray()
  @IsString({ each: true })
  featureIds: string[];

  @IsString()
  @IsNotEmpty()
  speedId: string;
}
