import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

const SIX_DIGITS = /^\d{6}$/;

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  /** The 6-digit OTP from the reset email. */
  @IsString()
  @Matches(SIX_DIGITS, { message: 'otp must be a 6-digit code' })
  otp: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}
