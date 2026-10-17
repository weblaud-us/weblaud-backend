import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Self-service profile edit — deliberately narrower than UpdateUserDto.
 * role, organization, orgRole, isActive, email, and password are absent on
 * purpose: a user PATCHing their own profile must never be able to grant
 * themselves admin, move organizations, or reactivate a disabled account.
 * Email changes and password changes each have their own dedicated,
 * more carefully guarded endpoint (or none, for email).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Set by the controller from the uploaded file, not accepted directly from the client — see users.controller.ts updateMe(). */
  @IsOptional()
  @IsString()
  avatar?: string;
}
