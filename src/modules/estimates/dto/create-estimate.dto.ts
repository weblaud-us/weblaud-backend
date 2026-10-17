import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadAttributionDto } from '../../leads/dto/lead-attribution.dto';
import { HEARD_ABOUT_OPTIONS } from '../../leads/lead.constants';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadAttributionDto)
  attribution?: LeadAttributionDto;

  @IsOptional()
  @IsIn(HEARD_ABOUT_OPTIONS)
  heardAbout?: string;
}
