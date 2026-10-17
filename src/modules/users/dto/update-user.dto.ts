import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Previously absent — an admin could invite a client into an org and pick
  // client_admin vs client_viewer at invite time, but PATCH /users/:id had
  // no way to change either afterward. A client_viewer could never be
  // promoted, and a client's org could never be corrected, without editing
  // the database directly.
  @IsOptional()
  @IsMongoId()
  organization?: string;

  @IsOptional()
  @IsEnum(OrgRole)
  orgRole?: OrgRole;

  /** Deactivate/reactivate — the reversible alternative to DELETE /users/:id. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Internal cost basis — see the schema comment on User.costRate. Staff only, set from /cpadmin/people. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  costRate?: number;

  /** What a client is charged per hour — see the schema comment on User.billRate. Staff only, set from /cpadmin/people. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  billRate?: number;
}
