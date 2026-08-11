import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from 'src/modules/mail/mail.service';
import { LoginDto } from './dto/auth.dto';
import { TokenService } from './tokens/token.service';
import { ResetPasswordDto } from './dto/reset-password.dto';

/** Returned for every send-otp call so the response cannot be used to test whether an account exists. */
const OTP_SENT_MESSAGE =
  'If an account exists for that email, an OTP has been sent';

const OTP_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private mail: MailService,
    private tokens: TokenService,
  ) {}

  // LOGIN
  async login(dto: LoginDto) {
    const user: any = await this.users.findByEmail(dto.email, true);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await user.comparePassword(dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    const tokenData = await this.tokens.signTokens(
      user._id.toString(),
      user.role,
    );

    await this.users.setRefreshToken(
      user._id.toString(),
      await bcrypt.hash(tokenData.refreshToken, 10),
    );

    return { user, ...tokenData };
  }

  // LOGOUT
  async logout(userId: string) {
    await this.users.clearRefreshToken(userId);
    return { message: 'Logged out successfully' };
  }

  // REFRESH TOKEN
  async refresh(userId: string, refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const user = await this.users.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.refreshToken) {
      throw new UnauthorizedException('No refresh token found for user');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const tokenData = await this.tokens.signTokens(userId, user.role);

    // Update refresh token in the database
    const hashedRefreshToken = await bcrypt.hash(tokenData.refreshToken, 10);
    await this.users.setRefreshToken(userId, hashedRefreshToken);

    return tokenData;
  }

  // SEND OTP
  async sendOtp(email: string) {
    const user = await this.users.findByEmail(email);

    // Same response either way — a distinct "OTP sent" for known addresses
    // turned this endpoint into an account-enumeration oracle.
    if (!user) return { message: OTP_SENT_MESSAGE };

    // randomInt is CSPRNG-backed. Math.random() is not, and its output is
    // recoverable from a handful of observed values — which for a password
    // reset code means account takeover.
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expires = new Date(Date.now() + OTP_TTL_MS);

    // Stored hashed: a database read should not yield a usable reset code.
    await this.users.saveOtp(email, await bcrypt.hash(otp, 10), expires);
    await this.mail.sendOtpEmail(email, otp);

    return { message: OTP_SENT_MESSAGE };
  }

  // VERIFY OTP
  async verifyOtp(email: string, otp: string) {
    const user = await this.users.verifyOtp(email, otp);
    if (!user) throw new BadRequestException('Invalid or expired OTP');

    return { message: 'OTP verified' };
  }

  // RESET PASSWORD
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.users.verifyOtp(dto.email, dto.otp);
    if (!user) throw new BadRequestException('Invalid or expired OTP');

    // Pass the plaintext: users.update() hashes it. Hashing here as well
    // stored bcrypt(bcrypt(password)), which no login could ever match — the
    // reset appeared to succeed and locked the account out permanently.
    await this.users.update(user._id.toString(), {
      password: dto.newPassword,
    });

    await this.users.clearOtp(user.email);

    // A password change must end existing sessions, otherwise a stolen refresh
    // token survives the reset that was meant to revoke it.
    await this.users.clearRefreshToken(user._id.toString());

    return { message: 'Password updated successfully' };
  }
}
