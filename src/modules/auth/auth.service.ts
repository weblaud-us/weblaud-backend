import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);

    const tokens = await this.generateTokens(user._id.toString(), user.role);

    const hashedRT = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshToken(user._id.toString(), hashedRT);

    return { user: user.toObject(), ...tokens };
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
    const user = await this.usersService.findByEmail(email);
    if (!user) return { message: 'OTP sent if email exists' };

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await this.usersService.saveOtp(email, otp, expires);

    // TODO: add nodemailer logic

    return { message: 'OTP sent if email exists' };
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
