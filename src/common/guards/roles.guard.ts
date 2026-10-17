import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!requiredRoles) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) throw new ForbiddenException('Authentication required');

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'You are not allowed to perform this action',
      );
    }

    return true;
  }
}
