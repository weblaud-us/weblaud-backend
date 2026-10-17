import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadAttributionDto } from '../../leads/dto/lead-attribution.dto';
import { HEARD_ABOUT_OPTIONS } from '../../leads/lead.constants';

/** Contact details exchanged for the full emailed report. Public input. */
export class ClaimAuditDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadAttributionDto)
  attribution?: LeadAttributionDto;

  @IsOptional()
  @IsIn(HEARD_ABOUT_OPTIONS)
  heardAbout?: string;
}
