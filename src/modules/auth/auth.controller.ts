import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/auth.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';

/**
 * There is deliberately no public `register` route.
 *
 * The only authenticated surface in this product is the internal admin panel —
 * there is no end-user account concept anywhere in the site. Self-registration
 * handed anyone a Role.USER account, which was the free foothold for reading
 * admin-adjacent data. Accounts are created by the seed service on first boot
 * and by `POST /users`, which is admin-gated.
 *
 * Every route here is rate-limited well below the global default: these are
 * the endpoints where an attacker gets unlimited guesses at a secret.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private auth: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    return await this.auth.login(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@GetUser() user: any) {
    return this.auth.logout(user._id.toString());
  }

  @Post('send-otp')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async sendOtp(@Body() dto: SendOtpDto) {
    return await this.auth.sendOtp(dto.email);
  }

  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return await this.auth.verifyOtp(dto.email, dto.otp);
  }

  /**
   * Completes the reset the OTP endpoints start. Previously AuthService had a
   * resetPassword method that no controller exposed, so send-otp and
   * verify-otp led nowhere.
   */
  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.auth.resetPassword(dto);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt-refresh'))
  async refresh(@Req() req) {
    if (!req.user || !req.user.sub) {
      throw new UnauthorizedException('Invalid user information in token');
    }

    try {
      return await this.auth.refresh(req.user.sub, req.user.refreshToken);
    } catch (error) {
      this.logger.warn(
        `Refresh failed for user ${req.user.sub}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
