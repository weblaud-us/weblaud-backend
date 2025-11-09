import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/modules/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private mailService: MailService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      // Check if user with this email already exists
      const existingUser = await this.usersService.findByEmail(dto.email);
      if (existingUser) {
        throw new BadRequestException('Email already in use');
      }

      const user = await this.usersService.create(dto);
      const tokens = await this.generateTokens(user._id.toString(), user.role);

      const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);
      await this.usersService.setRefreshToken(user._id.toString(), hashedRT);

      return { user: user.toObject(), ...tokens };
    } catch (error) {
      if (error.code === 11000) {
        // MongoDB duplicate key error
        throw new BadRequestException('Email already in use');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user: any = await this.usersService.findByEmail(dto.email, true);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await user.comparePassword(dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user._id.toString(), user.role);
    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);

    await this.usersService.setRefreshToken(user._id.toString(), hashedRT);

    return { user: user.toObject(), ...tokens };
  }

  async refreshToken(userId: string, refreshToken: string) {
    const user: any = await this.usersService.findOne(userId);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Not authorized');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!matches) throw new UnauthorizedException('Invalid refresh token');

    const tokens = await this.generateTokens(userId, user.role);

    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshToken(userId, hashedRT);

    return tokens;
  }

  async sendOtp(email: string) {
  try {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // For security, don't reveal if the email exists or not
      console.log(`OTP requested for non-existent email: ${email}`);
      return { message: 'If the email exists, an OTP has been sent' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.usersService.saveOtp(email, otp, expires);

    try {
      await this.mailService.sendOtpEmail(email, otp);
      console.log(`OTP sent successfully to ${email}`);
      return { message: 'OTP sent successfully' };
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      // Consider whether you want to inform the user that email sending failed
      // or just log it for debugging
      return { 
        message: 'Failed to send OTP. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      };
    }
  } catch (error) {
    console.error('Error in sendOtp:', error);
    throw new Error('Failed to process OTP request');
  }
}

  async verifyOtp(email: string, otp: string) {
    const user = await this.usersService.verifyOtp(email, otp);
    if (!user) throw new BadRequestException('Invalid or expired OTP');

    return { message: 'OTP verified' };
  }

  async generateTokens(userId: string, role: string) {
    const payload = { sub: userId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
