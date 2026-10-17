import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tokens } from './types/token.types';

@Injectable()
export class TokenService {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async signTokens(userId: string, role: string): Promise<Tokens> {
    const payload = { sub: userId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: (this.config.get<string>('jwt.expiresIn') || '15m') as any,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: (this.config.get<string>('jwt.refreshExpiresIn') ||
        '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  async verifyRefreshToken(token: string) {
    return this.jwt.verifyAsync(token, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
  }
}
