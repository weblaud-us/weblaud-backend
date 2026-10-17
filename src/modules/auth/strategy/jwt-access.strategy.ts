import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, VerifiedCallback } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtAccessStrategy.name);

  constructor(
    private config: ConfigService,
    private users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
      ignoreExpiration: false,
      passReqToCallback: false,
      jsonWebTokenOptions: {
        ignoreNotBefore: false,
        ignoreExpiration: false,
      },
    });
  }

  async validate(payload: any) {
    try {
      // Check if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < currentTime) {
        throw new UnauthorizedException('Token has expired');
      }

      // Check if token is not yet valid
      if (payload.nbf && payload.nbf > currentTime) {
        throw new UnauthorizedException('Token not yet valid');
      }

      // Verify user exists
      const user = await this.users.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if user is active
      if (user.isActive === false) {
        throw new UnauthorizedException('User account is disabled');
      }

      return user;
    } catch (error) {
      this.logger.error(`JWT validation failed: ${error.message}`, error.stack);
      throw error; // Re-throw the error to be handled by the JwtAuthGuard
    }
  }
}
