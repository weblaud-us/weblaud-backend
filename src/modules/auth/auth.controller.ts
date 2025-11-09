import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '../users/schemas/user.schema';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';

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

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refresh(@GetUser() user: User, @Body('refreshToken') token: string) {
    return this.auth.refreshToken(user._id.toString(), token);
  }
}
