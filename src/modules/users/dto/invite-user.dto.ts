import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';

/**
 * No password here — invited users set their own on accept-invite. That's
 * the whole point of an invite flow over POST /users, which creates an
 * already-active account with a password the admin chose.
 */
export class InviteUserDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;

  /** Required when role is USER (a client) — which organization they belong to. */
  @IsOptional()
  @IsMongoId()
  organization?: string;

  @IsOptional()
  @IsEnum(OrgRole)
  orgRole?: OrgRole;
}
