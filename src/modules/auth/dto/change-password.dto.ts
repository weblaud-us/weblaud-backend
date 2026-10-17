import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * The in-app password change, reachable by anyone already logged in
 * (including admin — there was previously no way to change the admin
 * password without going through the forgot-password/OTP flow). Distinct
 * from ResetPasswordDto: this path proves the caller still knows the
 * current password rather than an emailed OTP, since holding a live access
 * token alone isn't proof of that.
 */
export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}
