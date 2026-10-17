import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from 'src/common/enum/user.role.enum';
import {
  assertProjectAccess,
  assertProjectManager,
  hasProjectAccess,
  idsMatch,
  isProjectManager,
  isProjectTeam,
  projectAuthorRole,
  ProjectAccessActor,
  ProjectAccessSubject,
} from './project-access.util';

/**
 * project-access.util is the single point of truth every portal-scoped
 * module (updates, contracts, change requests, approvals, invoices) relies
 * on to decide "can this user touch this project". It's pure and
 * dependency-free — no Mongoose connection, no NestJS testing module
 * needed — which is exactly why it had no test at all before this: nothing
 * forced one. A wrong answer here doesn't 500; it silently leaks one
 * client's budget/contract/invoices to another, or silently denies a
 * legitimate user. Both failure modes are covered below.
 */
describe('project-access.util', () => {
  const pmId = new Types.ObjectId();
  const teamMemberId = new Types.ObjectId();
  const outsiderId = new Types.ObjectId();
  const orgId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();

  const project: ProjectAccessSubject = {
    organization: orgId,
    projectManager: pmId,
    team: [teamMemberId],
  };

  const admin: ProjectAccessActor = {
    _id: new Types.ObjectId(),
    role: Role.ADMIN,
  };
  const pm: ProjectAccessActor = { _id: pmId, role: Role.MANAGER };
  const teamMember: ProjectAccessActor = {
    _id: teamMemberId,
    role: Role.MANAGER,
  };
  const unassignedStaff: ProjectAccessActor = {
    _id: outsiderId,
    role: Role.MANAGER,
  };
  const client: ProjectAccessActor = {
    _id: new Types.ObjectId(),
    role: Role.USER,
    organization: orgId,
  };
  const outsiderClient: ProjectAccessActor = {
    _id: new Types.ObjectId(),
    role: Role.USER,
    organization: otherOrgId,
  };
  const orglessClient: ProjectAccessActor = {
    _id: new Types.ObjectId(),
    role: Role.USER,
  };

  describe('idsMatch', () => {
    it('matches an ObjectId against the equivalent string', () => {
      expect(idsMatch(pmId, pmId.toString())).toBe(true);
    });

    it('matches two ObjectId instances with the same value', () => {
      expect(idsMatch(pmId, new Types.ObjectId(pmId.toString()))).toBe(true);
    });

    it('does not match different ids', () => {
      expect(idsMatch(pmId, teamMemberId)).toBe(false);
    });

    it.each([
      ['both undefined', undefined, undefined],
      ['both null', null, null],
      ['left missing', undefined, pmId],
      ['right missing', pmId, undefined],
    ])('returns false rather than throwing when %s', (_label, a, b) => {
      expect(idsMatch(a, b)).toBe(false);
    });

    /**
     * The exact bug the doc comment on assertProjectAccess warns about: a
     * populated Mongoose document's default toString() is
     * "[object Object]", not the id, so comparing a populated field against
     * a real id string must never match. If this test ever starts failing
     * because someone "fixed" idsMatch to reach into `.id` or `._id`, that
     * would silently break the RAW-subject contract every call site
     * depends on — assertProjectAccess must keep failing closed here, not
     * start succeeding.
     */
    it('does not match a populated-document-shaped object against a real id', () => {
      const populatedLooking = {
        name: 'Acme Inc',
      } as unknown as Types.ObjectId;
      expect(idsMatch(populatedLooking, orgId)).toBe(false);
    });
  });

  describe('assertProjectAccess', () => {
    it('admits an admin unconditionally, even with no matching org/PM/team', () => {
      expect(() => assertProjectAccess(project, admin)).not.toThrow();
    });

    it('admits the project manager', () => {
      expect(() => assertProjectAccess(project, pm)).not.toThrow();
    });

    it('admits a team member', () => {
      expect(() => assertProjectAccess(project, teamMember)).not.toThrow();
    });

    it('rejects staff who are neither PM nor team', () => {
      expect(() => assertProjectAccess(project, unassignedStaff)).toThrow(
        ForbiddenException,
      );
    });

    it("admits a client in the project's organization", () => {
      expect(() => assertProjectAccess(project, client)).not.toThrow();
    });

    it('rejects a client from a different organization', () => {
      expect(() => assertProjectAccess(project, outsiderClient)).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a client with no organization at all rather than throwing a TypeError', () => {
      expect(() => assertProjectAccess(project, orglessClient)).toThrow(
        ForbiddenException,
      );
    });

    it('rejects when the subject carries a populated (non-raw) organization field', () => {
      // The documented footgun: idsMatch compares via .toString(), and a
      // populated organization document stringifies to "[object Object]",
      // which never equals a real id — so a legitimate client is denied
      // rather than silently admitted on a non-match, and denied rather
      // than crashing.
      const populatedSubject = {
        ...project,
        organization: {
          _id: orgId,
          name: 'Acme Inc',
        } as unknown as Types.ObjectId,
      };
      expect(() => assertProjectAccess(populatedSubject, client)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('hasProjectAccess', () => {
    it('returns true instead of throwing for an admitted actor', () => {
      expect(hasProjectAccess(project, pm)).toBe(true);
    });

    it('returns false instead of throwing for a denied actor', () => {
      expect(hasProjectAccess(project, unassignedStaff)).toBe(false);
    });
  });

  describe('isProjectManager', () => {
    it('treats admin as PM everywhere', () => {
      expect(isProjectManager(project, admin)).toBe(true);
    });

    it('is true for the assigned PM', () => {
      expect(isProjectManager(project, pm)).toBe(true);
    });

    it('is false for a team member who is not the PM', () => {
      expect(isProjectManager(project, teamMember)).toBe(false);
    });

    it('is false for a client, regardless of organization', () => {
      expect(isProjectManager(project, client)).toBe(false);
    });
  });

  describe('isProjectTeam', () => {
    it('is true for a listed team member', () => {
      expect(isProjectTeam(project, teamMember)).toBe(true);
    });

    it('is false for the PM — PM is not implicitly team', () => {
      expect(isProjectTeam(project, pm)).toBe(false);
    });

    it('is false when the project has no team array', () => {
      const noTeam: ProjectAccessSubject = {
        organization: orgId,
        projectManager: pmId,
        team: undefined as unknown as Types.ObjectId[],
      };
      expect(isProjectTeam(noTeam, teamMember)).toBe(false);
    });
  });

  describe('projectAuthorRole', () => {
    it("labels the PM's own post as 'pm'", () => {
      expect(projectAuthorRole(project, pm)).toBe('pm');
    });

    it("labels an admin's post as 'pm' — admins act as PM everywhere", () => {
      expect(projectAuthorRole(project, admin)).toBe('pm');
    });

    it("labels a team member's post as 'developer'", () => {
      expect(projectAuthorRole(project, teamMember)).toBe('developer');
    });
  });

  describe('assertProjectManager', () => {
    it('admits the PM', () => {
      expect(() => assertProjectManager(project, pm)).not.toThrow();
    });

    it('admits admin', () => {
      expect(() => assertProjectManager(project, admin)).not.toThrow();
    });

    it('rejects a team member who is not the PM', () => {
      expect(() => assertProjectManager(project, teamMember)).toThrow(
        ForbiddenException,
      );
    });
  });
});
