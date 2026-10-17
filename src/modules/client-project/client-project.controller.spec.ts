import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProjectController } from './client-project.controller';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * These endpoints are unscoped (every project, every org; update can change
 * organization/projectManager/team). They used to admit MANAGER, which let
 * any staff account put itself on any client's project. Exercised through the
 * real RolesGuard + the controller's own metadata, for every handler.
 */
describe('ClientProjectController — admin only', () => {
  const guard = new RolesGuard(new Reflector());
  const handlers = ['create', 'findAll', 'findOne', 'update', 'delete'] as const;

  function contextFor(role: Role, handler: (typeof handlers)[number]) {
    return {
      getHandler: () => ClientProjectController.prototype[handler],
      getClass: () => ClientProjectController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;
  }

  it.each(handlers)('rejects a MANAGER on %s', (handler) => {
    expect(() => guard.canActivate(contextFor(Role.MANAGER, handler))).toThrow(
      ForbiddenException,
    );
  });

  it.each(handlers)('rejects a client on %s', (handler) => {
    expect(() => guard.canActivate(contextFor(Role.USER, handler))).toThrow(
      ForbiddenException,
    );
  });

  it.each(handlers)('allows an ADMIN on %s', (handler) => {
    expect(guard.canActivate(contextFor(Role.ADMIN, handler))).toBe(true);
  });
});
