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
import {
  BUDGET_OPTIONS,
  HEARD_ABOUT_OPTIONS,
  TIMELINE_OPTIONS,
} from '../../leads/lead.constants';

// Length caps: this is a public, unauthenticated write. Without them a single
// request could store (and email the admin inbox) megabytes of text.
export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadAttributionDto)
  attribution?: LeadAttributionDto;

  @IsOptional()
  @IsIn(HEARD_ABOUT_OPTIONS)
  heardAbout?: string;

  @IsOptional()
  @IsIn(BUDGET_OPTIONS)
  budget?: string;

  @IsOptional()
  @IsIn(TIMELINE_OPTIONS)
  timeline?: string;
}
