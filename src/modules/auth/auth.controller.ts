import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '../users/schemas/user.schema';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @Public()
  async register(@Body() dto: RegisterDto) {
    return await this.auth.register(dto);
  }

  @Post('login')
  @Public()
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
  async sendOtp(@Body('email') email: string) {
    return await this.auth.sendOtp(email);
  }

  @Post('verify-otp')
  @Public()
  async verifyOtp(@Body() body: { email: string; otp: string }) {
    return await this.auth.verifyOtp(body.email, body.otp);
  }

  @Post('refresh')
  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  async refresh(@Req() req) {
    try {
      if (!req.user || !req.user.sub) {
        throw new UnauthorizedException('Invalid user information in token');
      }
      return await this.auth.refresh(req.user.sub, req.user.refreshToken);
    } catch (error) {
      // Log the error for debugging
      console.error('Refresh token error:', error);
      throw error; // Let the global exception filter handle it
    }
  }
}
