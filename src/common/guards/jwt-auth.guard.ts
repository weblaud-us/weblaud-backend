import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context) {
    const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err || !user) {
      // Handle different JWT error cases
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      } else if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      } else if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token not yet valid');
      } else if (info?.message === 'No auth token') {
        throw new UnauthorizedException('No authentication token provided');
      } else if (info?.message === 'jwt malformed') {
        throw new UnauthorizedException('Malformed token');
      }

      // Default error message
      throw new UnauthorizedException('Authentication failed');
    }

    return user;
  }
}
