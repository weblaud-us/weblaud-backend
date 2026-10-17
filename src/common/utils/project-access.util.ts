import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from 'src/common/enum/user.role.enum';

type Id = Types.ObjectId | string | undefined | null;

/** Shape every /portal/* membership check needs off a ClientProject document. */
export interface ProjectAccessSubject {
  organization: Id;
  projectManager: Id;
  team: Id[];
}

/** Shape every /portal/* membership check needs off the requesting user. */
export interface ProjectAccessActor {
  _id: Id;
  role: Role;
  organization?: Id;
}

/**
 * Exported for reuse by every other org/project-scoped module (contracts,
 * change requests, approvals, invoices) that needs the same "does this id
 * match" comparison — a raw `===` between an ObjectId and a session string
 * never matches, which silently denies a legitimate user rather than
 * throwing, so this is the one place that comparison is allowed to happen.
 */
export function idsMatch(a: Id, b: Id): boolean {
  return !!a && !!b && a.toString() === b.toString();
}

/**
 * Single point of truth for "can this user touch this project", used by
 * every client-project-scoped module (updates, files, tasks, messages,
 * approvals, change requests, invoices, contracts). Access is:
 *
 *   - ADMIN: always.
 *   - MANAGER (staff): only if they're the project's PM or on its team.
 *   - USER (client): only if they belong to the project's organization.
 *
 * Throws rather than returning a boolean so call sites can't forget to check
 * the result — the alternative (`if (!hasAccess(...)) throw ...` repeated at
 * every call site) is exactly the kind of thing that gets forgotten once and
 * leaks a project's budget/contract/invoices cross-tenant.
 *
 * IMPORTANT: call this against the RAW (unpopulated) subject — organization/
 * projectManager/team must still be ObjectIds, not populated documents.
 * idsMatch() compares via `.toString()`, and a populated Mongoose document's
 * toString() is the default Object.prototype one ("[object Object]"), which
 * never matches a real id string. That's a silent wrong-answer (a legitimate
 * user gets denied), not a crash — fetch/verify access first with a lean,
 * unpopulated query (see ClientProjectService.findAccessSubject), then
 * populate separately for the response.
 */
export function assertProjectAccess(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): void {
  if (user.role === Role.ADMIN) return;

  if (user.role === Role.MANAGER) {
    const isProjectManager = idsMatch(project.projectManager, user._id);
    const isTeamMember = (project.team ?? []).some((t) =>
      idsMatch(t, user._id),
    );
    if (isProjectManager || isTeamMember) return;
  }

  if (user.role === Role.USER) {
    if (idsMatch(project.organization, user.organization)) return;
  }

  throw new ForbiddenException('You do not have access to this project');
}

/** True/false version for list-filtering (e.g. "which projects can this staff member see"). */
export function hasProjectAccess(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): boolean {
  try {
    assertProjectAccess(project, user);
    return true;
  } catch {
    return false;
  }
}

/**
 * PM-vs-developer is decided per-project, not by a global role — the same
 * MANAGER account is the PM on one project and a team member (developer) on
 * another. ADMIN counts as PM everywhere so an agency owner can act on any
 * project without being formally assigned to it. Same RAW-subject rule as
 * assertProjectAccess: pass unpopulated ObjectIds.
 */
export function isProjectManager(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): boolean {
  if (user.role === Role.ADMIN) return true;
  return idsMatch(project.projectManager, user._id);
}

/** True if the user is on the project's team (a developer on it). PM/admin are not implicitly team. */
export function isProjectTeam(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): boolean {
  return (project.team ?? []).some((t) => idsMatch(t, user._id));
}

/**
 * The author's role *on this project*, snapshotted onto each update so the
 * feed can label who posted it and the state machine knows whether it needs
 * PM review (developer) or publishes immediately (pm/admin).
 */
export function projectAuthorRole(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): 'pm' | 'developer' {
  return isProjectManager(project, user) ? 'pm' : 'developer';
}

/** Guard for PM-only actions (approve/reject an update, edit the project, manage the team). */
export function assertProjectManager(
  project: ProjectAccessSubject,
  user: ProjectAccessActor,
): void {
  if (!isProjectManager(project, user)) {
    throw new ForbiddenException(
      'Only the project manager can perform this action',
    );
  }
}
