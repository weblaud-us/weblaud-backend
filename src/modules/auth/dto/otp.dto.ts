import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * These exist as classes, not TypeScript interfaces, on purpose.
 *
 * Interfaces are erased at compile time, so the global ValidationPipe has no
 * metatype to work with and silently validates nothing — `whitelist` and
 * `forbidNonWhitelisted` both become no-ops. The OTP endpoints previously typed
 * their body as an inline interface, which let an object like
 * `{"otp": {"$gt": ""}}` reach a Mongo filter as a query operator.
 */

const SIX_DIGITS = /^\d{6}$/;

export class SendOtpDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @Matches(SIX_DIGITS, { message: 'otp must be a 6-digit code' })
  otp: string;
}
