import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';
import { PortalInviteDto, UpdateTeamMemberDto } from './dto/portal-team.dto';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { OrganizationService } from 'src/modules/organization/organization.service';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';
import { idsMatch } from 'src/common/utils/project-access.util';

export type TeamMemberStatus =
  | 'active'
  | 'invited'
  | 'invite_expired'
  | 'deactivated';

export interface TeamMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  orgRole?: OrgRole;
  avatar?: string;
  status: TeamMemberStatus;
}

/** req.user as far as this service cares. */
export interface TeamActor {
  _id: Types.ObjectId | string;
  role: Role;
  orgRole?: OrgRole;
  organization?: Types.ObjectId | string;
}

/** Pure — exported for the spec. An unaccepted invite still carries its token expiry; a deactivated account doesn't. */
export function memberStatus(
  user: { isActive: boolean; inviteTokenExpires?: Date },
  now: Date = new Date(),
): TeamMemberStatus {
  if (user.isActive) return 'active';
  if (!user.inviteTokenExpires) return 'deactivated';
  return new Date(user.inviteTokenExpires) < now ? 'invite_expired' : 'invited';
}

/**
 * Self-service team management for client organizations, so a client
 * doesn't have to email the agency to add a colleague. Everything is
 * scoped to the caller's own organization: only client users get in at all,
 * only a client_admin can change anything, invites are always role USER in
 * the caller's org, and an org can never lose its last active client admin.
 */
@Injectable()
export class PortalTeamService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly users: UsersService,
    private readonly organizations: OrganizationService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Client users only — staff manage people from /cpadmin. Returns the org id. */
  private orgOf(actor: TeamActor): string {
    if (actor.role !== Role.USER || !actor.organization) {
      throw new ForbiddenException(
        'Team management is for client accounts — staff use the admin panel',
      );
    }
    return actor.organization.toString();
  }

  private assertClientAdmin(actor: TeamActor): string {
    const orgId = this.orgOf(actor);
    if (actor.orgRole !== OrgRole.CLIENT_ADMIN) {
      throw new ForbiddenException('Only a client admin can manage the team');
    }
    return orgId;
  }

  private async orgName(orgId: string): Promise<string | undefined> {
    try {
      return (await this.organizations.findOne(orgId)).name;
    } catch {
      return undefined;
    }
  }

  private toMember(user: any): TeamMember {
    return {
      _id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      orgRole: user.orgRole,
      avatar: user.avatar,
      status: memberStatus(user),
    };
  }

  /** A user in the caller's org, or 404 — never reveals whether an id exists elsewhere. */
  private async findMember(orgId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('User not found');
    const user = await this.userModel
      .findOne({ _id: id, organization: orgId, role: Role.USER })
      .select('+inviteTokenExpires +password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async list(actor: TeamActor): Promise<TeamMember[]> {
    const orgId = this.orgOf(actor);
    const users = await this.userModel
      .find({ organization: orgId, role: Role.USER })
      .select('firstName lastName email orgRole avatar isActive +inviteTokenExpires')
      .sort({ isActive: -1, firstName: 1 })
      .lean();
    return users.map((u) => this.toMember(u));
  }

  async invite(actor: TeamActor, dto: PortalInviteDto): Promise<TeamMember> {
    const orgId = this.assertClientAdmin(actor);
    const user = await this.users.invite(
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        orgRole: dto.orgRole,
        // Never taken from the request.
        role: Role.USER,
        organization: orgId,
      },
      actor._id.toString(),
      await this.orgName(orgId),
    );
    // invite() writes the token expiry separately, so the returned document
    // doesn't carry it yet — the status is known, though.
    return { ...this.toMember(user.toObject()), status: 'invited' };
  }

  async resendInvite(actor: TeamActor, id: string) {
    const orgId = this.assertClientAdmin(actor);
    const user = await this.findMember(orgId, id);
    if (user.isActive) {
      throw new BadRequestException('They have already accepted their invite');
    }
    if (!user.inviteTokenExpires) {
      throw new BadRequestException(
        'This account was deactivated — reactivate it instead',
      );
    }
    await this.users.resendInvite(id, await this.orgName(orgId));
    await this.auditLog.record({
      actor: actor._id.toString(),
      action: 'user.invite_resent',
      entityType: 'User',
      entityId: id,
      meta: { by: 'client_admin' },
    });
    return { message: 'Invite resent' };
  }

  async update(
    actor: TeamActor,
    id: string,
    dto: UpdateTeamMemberDto,
  ): Promise<TeamMember> {
    const orgId = this.assertClientAdmin(actor);
    const user = await this.findMember(orgId, id);
    const isSelf = idsMatch(user._id as Types.ObjectId, actor._id);

    if (dto.active === false && isSelf) {
      throw new BadRequestException("You can't deactivate your own account");
    }

    const losesAdmin =
      user.isActive &&
      user.orgRole === OrgRole.CLIENT_ADMIN &&
      (dto.active === false ||
        (dto.orgRole !== undefined && dto.orgRole !== OrgRole.CLIENT_ADMIN));
    if (losesAdmin) {
      const otherAdmins = await this.userModel.countDocuments({
        _id: { $ne: user._id },
        organization: orgId,
        role: Role.USER,
        orgRole: OrgRole.CLIENT_ADMIN,
        isActive: true,
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Your organization needs at least one active client admin — make someone else an admin first',
        );
      }
    }

    if (dto.active === true && !user.isActive && !user.password) {
      throw new BadRequestException(
        "They haven't accepted their invite yet — resend it instead",
      );
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (dto.orgRole !== undefined && dto.orgRole !== user.orgRole) {
      $set.orgRole = dto.orgRole;
    }
    if (dto.active !== undefined && dto.active !== user.isActive) {
      $set.isActive = dto.active;
      if (!dto.active) {
        // Ends their sessions (refresh fails; JwtAccessStrategy already
        // rejects inactive users) and kills any pending invite link.
        Object.assign($unset, {
          refreshToken: 1,
          inviteToken: 1,
          inviteTokenExpires: 1,
        });
      }
    }

    if (Object.keys($set).length || Object.keys($unset).length) {
      await this.userModel.updateOne(
        { _id: user._id },
        {
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
      );
    }

    if ($set.orgRole !== undefined) {
      await this.auditLog.record({
        actor: actor._id.toString(),
        action: 'user.org_role_changed',
        entityType: 'User',
        entityId: id,
        meta: { from: user.orgRole, to: $set.orgRole },
      });
    }
    if ($set.isActive !== undefined) {
      await this.auditLog.record({
        actor: actor._id.toString(),
        action: $set.isActive ? 'user.reactivated' : 'user.deactivated',
        entityType: 'User',
        entityId: id,
        meta: { by: 'client_admin' },
      });
    }

    const updated = await this.userModel
      .findById(user._id)
      .select('firstName lastName email orgRole avatar isActive +inviteTokenExpires')
      .lean();
    return this.toMember(updated);
  }
}
