import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PortalTeamService, memberStatus } from './portal-team.service';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';

const ORG = '507f1f77bcf86cd799439012';
const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439002';

const clientAdmin = { _id: ADMIN_ID, role: Role.USER, orgRole: OrgRole.CLIENT_ADMIN, organization: ORG };
const clientViewer = { ...clientAdmin, orgRole: OrgRole.CLIENT_VIEWER };
const staff = { _id: ADMIN_ID, role: Role.ADMIN };

function target(overrides: Record<string, unknown> = {}) {
  return {
    _id: TARGET_ID,
    firstName: 'Ben',
    lastName: 'Lee',
    email: 'ben@client.test',
    orgRole: OrgRole.CLIENT_VIEWER,
    isActive: true,
    password: 'hash',
    ...overrides,
  };
}

describe('memberStatus', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  it('tells active, invited, expired and deactivated apart', () => {
    expect(memberStatus({ isActive: true }, now)).toBe('active');
    expect(memberStatus({ isActive: false, inviteTokenExpires: new Date('2026-10-18T00:00:00Z') }, now)).toBe('invited');
    expect(memberStatus({ isActive: false, inviteTokenExpires: new Date('2026-10-16T00:00:00Z') }, now)).toBe(
      'invite_expired',
    );
    expect(memberStatus({ isActive: false }, now)).toBe('deactivated');
  });
});

describe('PortalTeamService', () => {
  let userModel: Record<string, jest.Mock>;
  let users: { invite: jest.Mock; resendInvite: jest.Mock };
  let auditLog: { record: jest.Mock };
  let service: PortalTeamService;

  /** findOne(...).select(...) → doc */
  const findOneReturning = (doc: unknown) => ({ select: jest.fn().mockResolvedValue(doc) });

  beforeEach(() => {
    userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      }),
      findOne: jest.fn().mockReturnValue(findOneReturning(target())),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(target()),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    users = {
      invite: jest.fn().mockImplementation((dto) =>
        Promise.resolve({ toObject: () => ({ _id: 'new', isActive: false, ...dto }) }),
      ),
      resendInvite: jest.fn().mockResolvedValue({ message: 'Invite resent' }),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PortalTeamService(
      userModel as any,
      users as any,
      { findOne: jest.fn().mockResolvedValue({ name: 'Acme Inc' }) } as any,
      auditLog as any,
    );
  });

  describe('who gets in', () => {
    it('turns staff away — they manage people from /cpadmin', async () => {
      await expect(service.list(staff)).rejects.toThrow(ForbiddenException);
      await expect(
        service.invite(staff, { firstName: 'A', lastName: 'B', email: 'a@b.test', orgRole: OrgRole.CLIENT_VIEWER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a viewer see the team but not change it', async () => {
      await expect(service.list(clientViewer)).resolves.toEqual([]);
      expect(userModel.find).toHaveBeenCalledWith({ organization: ORG, role: Role.USER });
      await expect(
        service.invite(clientViewer, { firstName: 'A', lastName: 'B', email: 'a@b.test', orgRole: OrgRole.CLIENT_VIEWER }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.update(clientViewer, TARGET_ID, { orgRole: OrgRole.CLIENT_ADMIN })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('invite', () => {
    it("always invites a client user into the caller's own organization", async () => {
      const member = await service.invite(clientAdmin, {
        firstName: 'Cara',
        lastName: 'Diaz',
        email: 'cara@client.test',
        orgRole: OrgRole.CLIENT_ADMIN,
      });

      expect(users.invite).toHaveBeenCalledWith(
        {
          firstName: 'Cara',
          lastName: 'Diaz',
          email: 'cara@client.test',
          orgRole: OrgRole.CLIENT_ADMIN,
          role: Role.USER,
          organization: ORG,
        },
        ADMIN_ID,
        'Acme Inc',
      );
      expect(member.status).toBe('invited');
    });
  });

  describe('update', () => {
    it("can't touch someone in another organization (404, not 403)", async () => {
      userModel.findOne.mockReturnValue(findOneReturning(null));
      await expect(service.update(clientAdmin, TARGET_ID, { active: false })).rejects.toThrow(NotFoundException);
      expect(userModel.findOne).toHaveBeenCalledWith({ _id: TARGET_ID, organization: ORG, role: Role.USER });
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('refuses to demote the last active client admin', async () => {
      userModel.findOne.mockReturnValue(findOneReturning(target({ orgRole: OrgRole.CLIENT_ADMIN })));
      userModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.update(clientAdmin, TARGET_ID, { orgRole: OrgRole.CLIENT_VIEWER }),
      ).rejects.toThrow(BadRequestException);
      expect(userModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ organization: ORG, orgRole: OrgRole.CLIENT_ADMIN, isActive: true }),
      );
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('refuses to deactivate the last active client admin', async () => {
      userModel.findOne.mockReturnValue(findOneReturning(target({ orgRole: OrgRole.CLIENT_ADMIN })));
      userModel.countDocuments.mockResolvedValue(0);
      await expect(service.update(clientAdmin, TARGET_ID, { active: false })).rejects.toThrow(BadRequestException);
    });

    it('deactivates an admin when another admin remains, ending their sessions', async () => {
      userModel.findOne.mockReturnValue(findOneReturning(target({ orgRole: OrgRole.CLIENT_ADMIN })));
      userModel.countDocuments.mockResolvedValue(1);

      await service.update(clientAdmin, TARGET_ID, { active: false });

      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: TARGET_ID },
        {
          $set: { isActive: false },
          $unset: { refreshToken: 1, inviteToken: 1, inviteTokenExpires: 1 },
        },
      );
      expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.deactivated' }));
    });

    it("won't let a client admin deactivate themselves", async () => {
      userModel.findOne.mockReturnValue(findOneReturning(target({ _id: ADMIN_ID, orgRole: OrgRole.CLIENT_ADMIN })));
      await expect(service.update(clientAdmin, ADMIN_ID, { active: false })).rejects.toThrow(BadRequestException);
    });

    it("won't reactivate someone who never accepted their invite", async () => {
      userModel.findOne.mockReturnValue(findOneReturning(target({ isActive: false, password: undefined })));
      await expect(service.update(clientAdmin, TARGET_ID, { active: true })).rejects.toThrow(BadRequestException);
    });

    it('promotes a viewer and records it', async () => {
      await service.update(clientAdmin, TARGET_ID, { orgRole: OrgRole.CLIENT_ADMIN });
      expect(userModel.updateOne).toHaveBeenCalledWith({ _id: TARGET_ID }, { $set: { orgRole: OrgRole.CLIENT_ADMIN } });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.org_role_changed',
          meta: { from: OrgRole.CLIENT_VIEWER, to: OrgRole.CLIENT_ADMIN },
        }),
      );
    });
  });

  describe('resendInvite', () => {
    it("only resends a pending invite in the caller's org", async () => {
      userModel.findOne.mockReturnValue(
        findOneReturning(target({ isActive: false, inviteTokenExpires: new Date(), password: undefined })),
      );
      await service.resendInvite(clientAdmin, TARGET_ID);
      expect(users.resendInvite).toHaveBeenCalledWith(TARGET_ID, 'Acme Inc');

      userModel.findOne.mockReturnValue(findOneReturning(target()));
      await expect(service.resendInvite(clientAdmin, TARGET_ID)).rejects.toThrow(BadRequestException);
    });
  });

  it('rejects a malformed id without querying', async () => {
    await expect(service.update(clientAdmin, 'nope', { active: false })).rejects.toThrow(NotFoundException);
    expect(userModel.findOne).not.toHaveBeenCalled();
  });
});
