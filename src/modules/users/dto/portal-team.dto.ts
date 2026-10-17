import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrgRole } from 'src/common/enum/org-role.enum';

/**
 * What a client admin may set when inviting a colleague. Deliberately has no
 * `role` or `organization`: PortalTeamService forces role USER and the
 * caller's own organization, and with forbidNonWhitelisted any attempt to
 * send either is rejected outright.
 */
export class PortalInviteDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsEnum(OrgRole)
  orgRole: OrgRole;
}

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsEnum(OrgRole)
  orgRole?: OrgRole;

  /** false deactivates (or revokes a pending invite); true reactivates someone who had accepted before. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
