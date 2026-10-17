import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateEmailPreferencesDto } from './dto/update-email-preferences.dto';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';
import { MailService } from 'src/modules/mail/mail.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { verifyUnsubscribeToken } from 'src/common/utils/email-preference-token.util';

/** Mirrors User.emailPreferences' keys — the whitelist an unsubscribe link's `category` query param is checked against, since it drives a `$set` path built from user input. */
const EMAIL_CATEGORIES = [
  'contracts',
  'invoices',
  'approvals',
  'changeRequests',
  'updates',
  'mentions',
] as const;
type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Wrong codes accepted against one issued password-reset OTP before it is discarded. */
export const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateUserDto) {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = new this.userModel({
      ...dto,
      password: hashedPassword,
    });
    return user.save();
  }

  async findAll(
    page: number,
    limit: number,
    role?: string,
    isActive?: boolean,
  ) {
    const query: any = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive;

    const data = await this.userModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const count = await this.userModel.countDocuments(query);

    return { data, total: count, page, limit };
  }

  async findOne(id: string) {
    try {
      const user = await this.userModel
        .findById(id)
        .select('+refreshToken') // Include refreshToken in the result
        .maxTimeMS(2000) // 2 second timeout
        .exec();

      return user;
    } catch (error) {
      console.error('Error finding user:', error);
      return null; // Return null instead of throwing to prevent guard failures
    }
  }

  async findByEmail(email: string, withPassword = false) {
    const query = this.userModel.findOne({ email });
    if (withPassword) {
      query.select('+password +refreshToken');
    } else {
      query.select('+refreshToken');
    }
    return query.exec();
  }

  async setRefreshToken(userId: string, hashedToken: string) {
    try {
      const result = await this.userModel.findByIdAndUpdate(
        userId,
        { refreshToken: hashedToken },
        { new: true },
      );

      if (!result) {
        throw new Error(`User with ID ${userId} not found`);
      }

      return result;
    } catch (error) {
      console.error('Error setting refresh token:', error);
      throw new Error('Failed to set refresh token');
    }
  }

  async clearRefreshToken(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
  }

  async updateLastLogin(id: string) {
    await this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() });
  }

  /** `hashedOtp` must already be bcrypt-hashed by the caller. */
  async saveOtp(email: string, hashedOtp: string, expires: Date) {
    await this.userModel.updateOne(
      { email },
      { otpCode: hashedOtp, otpExpires: expires, otpAttempts: 0 },
    );
  }

  async clearOtp(email: string) {
    await this.userModel.updateOne(
      { email },
      { $unset: { otpCode: 1, otpExpires: 1, otpAttempts: 1 } },
    );
  }

  /**
   * Looks the user up by email and compares the OTP in application code rather
   * than putting the submitted value into the query. The previous version
   * matched `{ otpCode: otp }` directly, so a body of `{"otp": {"$gt": ""}}`
   * matched any stored OTP — the DTO now blocks that shape, and this keeps it
   * from being a query operator even if it ever got through.
   *
   * Wrong guesses are counted per account, and the code is thrown away after
   * MAX_OTP_ATTEMPTS of them. The per-IP throttle alone let an attacker
   * spread guesses across addresses for the code's whole lifetime — a
   * 6-digit code is only a million possibilities.
   */
  async verifyOtp(email: string, otp: string) {
    const user = await this.userModel
      .findOne({ email })
      .select('+otpCode +otpExpires +otpAttempts');

    if (!user?.otpCode || !user.otpExpires) return null;
    if (user.otpExpires.getTime() <= Date.now()) return null;
    if ((user.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      await this.clearOtp(email);
      return null;
    }

    if (await bcrypt.compare(otp, user.otpCode)) return user;

    // $inc, not read-modify-write: parallel guesses must each count. Matching
    // on the current otpCode keeps a miss against an old code from counting
    // against a freshly issued one.
    const counted = await this.userModel
      .findOneAndUpdate(
        { _id: user._id, otpCode: user.otpCode },
        { $inc: { otpAttempts: 1 } },
        { new: true },
      )
      .select('+otpAttempts');
    if ((counted?.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      await this.clearOtp(email);
    }
    return null;
  }

  async update(id: string, dto: UpdateUserDto) {
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }
    return this.userModel.findByIdAndUpdate(id, dto, { new: true });
  }

  /**
   * Thin audited wrapper around update() for the admin-only PATCH
   * /users/:id path — update() itself stays unaudited because it's also
   * used by AuthService.resetPassword's self-service OTP flow, where
   * there's no "admin changed this user" event to record, only the user
   * changing their own forgotten password.
   */
  async adminUpdate(id: string, dto: UpdateUserDto, actorId: string) {
    const updated = await this.update(id, dto);
    if (!updated) throw new NotFoundException('User not found');
    await this.auditLog.record({
      actor: actorId,
      action: 'user.update',
      entityType: 'User',
      entityId: id,
      // Field names only, never values — role/org changes are worth an
      // audit trail, but a changed password must never be reconstructable
      // from one, hashed or not.
      meta: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async remove(id: string, actorId: string) {
    const deleted = await this.userModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('User not found');
    await this.auditLog.record({
      actor: actorId,
      action: 'user.remove',
      entityType: 'User',
      entityId: id,
      meta: { email: deleted.email },
    });
    return deleted;
  }

  // ================================
  //     PORTAL WORKSPACE HELPERS
  // ================================

  /**
   * Active client users in an organization — used to fan out notifications
   * (a PM posts an update, everyone at the client company should hear about
   * it) without leaking staff-only fields. Excludes anyone who hasn't
   * accepted their invite yet: an inactive account can't log in to see the
   * notification anyway.
   */
  async findByOrganization(organizationId: string) {
    return this.userModel
      .find({ organization: organizationId, role: Role.USER, isActive: true })
      .select('_id firstName lastName email')
      .lean();
  }

  /**
   * Client users who can act on money/approval decisions for an org (sign a
   * contract, approve a change order, pay an invoice) — i.e. `client_admin`,
   * not `client_viewer`. Used to fan out "needs your decision" notifications
   * so a read-only viewer doesn't get pinged for something they can't act on.
   */
  async findClientAdmins(organizationId: string) {
    return this.userModel
      .find({
        organization: organizationId,
        role: Role.USER,
        orgRole: OrgRole.CLIENT_ADMIN,
        isActive: true,
      })
      .select('_id firstName lastName email')
      .lean();
  }

  /**
   * Same client-admin lookup as findClientAdmins, batched across many
   * organizations in one query — for jobs like InvoiceService's overdue
   * reminder run that would otherwise issue one findClientAdmins() call per
   * invoice, most of which share an org. Returns a map keyed by
   * organization id (string) so callers can look their invoice's admins up
   * without a second pass over the result.
   */
  async findClientAdminsForOrgs(organizationIds: string[]) {
    const admins = await this.userModel
      .find({
        organization: { $in: organizationIds },
        role: Role.USER,
        orgRole: OrgRole.CLIENT_ADMIN,
        isActive: true,
      })
      .select('_id firstName lastName email organization')
      .lean();

    const byOrg = new Map<string, typeof admins>();
    for (const admin of admins) {
      const orgId = admin.organization!.toString();
      const existing = byOrg.get(orgId);
      if (existing) existing.push(admin);
      else byOrg.set(orgId, [admin]);
    }
    return byOrg;
  }

  /**
   * Just the fields project-access checks need (id, role, organization), for
   * a batch of user ids — e.g. CommentService checking that every user a
   * comment would notify can actually read it. Inactive users are excluded:
   * they can't sign in to see anything anyway.
   */
  async findAccessActors(ids: string[]) {
    return this.userModel
      .find({ _id: { $in: ids }, isActive: true })
      .select('_id role organization')
      .lean();
  }

  /**
   * Agency staff (admin + manager) for the PM's team-assignment picker.
   * Deliberately excludes EDITOR (marketing-CMS-only accounts with no
   * portal membership) and clients. Minimal field set — this list is shown
   * to a PM assigning teammates, never full user records.
   */
  async findStaff() {
    return this.userModel
      .find({ role: { $in: [Role.ADMIN, Role.MANAGER] }, isActive: true })
      .select('_id firstName lastName email avatar title role')
      .lean();
  }

  /**
   * Self-service profile edit (any authed user). Deliberately a narrower
   * surface than UpdateUserDto/update() above — role, organization, orgRole,
   * isActive, email, and password all stay off this path so a client or
   * staff member can never grant themselves admin or move to a different
   * organization by PATCHing their own profile.
   */
  async updateProfile(id: string, dto: UpdateProfileDto) {
    const updated = await this.userModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  /**
   * Verifies the caller's current password before setting a new one — unlike
   * the OTP/invite reset paths, this one is reachable by anyone already
   * logged in, so it has to prove they still know the old secret rather than
   * just holding a live access token (a stolen-but-not-yet-expired token
   * shouldn't be enough to lock the real owner out).
   */
  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.userModel.findById(id).select('+password');
    if (!user) throw new NotFoundException('User not found');

    const valid = await user.comparePassword(currentPassword);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    user.password = await bcrypt.hash(newPassword, 10);
    // A password change must end existing sessions the same way
    // AuthService.resetPassword does — otherwise a stolen refresh token
    // survives the very change meant to revoke it.
    user.refreshToken = undefined;
    await user.save();

    return { message: 'Password updated successfully' };
  }

  /** Self-service — any authed user, own record only. See UsersController#updateEmailPreferences. */
  async updateEmailPreferences(id: string, dto: UpdateEmailPreferencesDto) {
    const update: Record<string, boolean> = {};
    for (const key of EMAIL_CATEGORIES) {
      if (dto[key] !== undefined) update[`emailPreferences.${key}`] = dto[key];
    }

    const updated = await this.userModel.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true },
    );
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  /**
   * The unsubscribe-link landing action — no session, just a userId + HMAC
   * token (see email-preference-token.util.ts for why this doesn't need a
   * DB-stored token like invite/OTP). `category: 'all'` (the default one
   * link in every email footer effectively points at, once a user asks to
   * stop everything) turns every category off in one write.
   */
  async unsubscribeByToken(
    userId: string,
    token: string,
    category: string,
  ): Promise<{ category: string }> {
    const secret = this.config.get<string>('mail.unsubscribeSecret');
    if (!secret || !verifyUnsubscribeToken(userId, token, secret)) {
      throw new BadRequestException('Invalid or expired unsubscribe link');
    }

    if (category === 'all') {
      // Built from EMAIL_CATEGORIES rather than a hand-written object: the
      // literal used to omit `mentions`, and because this replaces the whole
      // subdocument, the schema default put mentions back to true — "stop
      // all emails" kept sending mention emails.
      await this.userModel.updateOne(
        { _id: userId },
        {
          $set: Object.fromEntries(
            EMAIL_CATEGORIES.map((key) => [`emailPreferences.${key}`, false]),
          ),
        },
      );
      return { category: 'all' };
    }

    if (!EMAIL_CATEGORIES.includes(category as EmailCategory)) {
      throw new BadRequestException(`Unknown email category "${category}"`);
    }

    await this.userModel.updateOne(
      { _id: userId },
      { $set: { [`emailPreferences.${category}`]: false } },
    );
    return { category };
  }

  // ================================
  //     INVITE FLOW
  // ================================

  /**
   * Creates an inactive, passwordless user (client or staff) and emails them
   * an accept-invite link. Mirrors the OTP pattern: the raw token is only
   * ever in the email — the DB holds a bcrypt hash of it.
   */
  async invite(dto: InviteUserDto, actorId: string, inviterOrgName?: string) {
    if (dto.role === Role.USER && !dto.organization) {
      throw new BadRequestException(
        'organization is required when inviting a client (role: user)',
      );
    }

    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = await this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      role: dto.role,
      organization: dto.organization,
      orgRole: dto.orgRole,
      isActive: false,
    });

    await this.issueInvite(user, inviterOrgName);

    await this.auditLog.record({
      actor: actorId,
      action: 'user.invite',
      entityType: 'User',
      entityId: user._id.toString(),
      meta: { email: user.email, role: user.role },
    });

    return user;
  }

  /** Re-issues a fresh token for a user who never accepted (or lost the email). */
  async resendInvite(id: string, inviterOrgName?: string) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.isActive) {
      throw new BadRequestException('User has already accepted their invite');
    }

    await this.issueInvite(user, inviterOrgName);
    return { message: 'Invite resent' };
  }

  private async issueInvite(user: UserDocument, inviterOrgName?: string) {
    const ttlHours = this.config.get<number>('invite.tokenTtlHours', 72);
    const rawToken = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.userModel.updateOne(
      { _id: user._id },
      {
        inviteToken: await bcrypt.hash(rawToken, 10),
        inviteTokenExpires: expires,
      },
    );

    const portalBase = (
      this.config.get<string>('portal.baseUrl') ?? ''
    ).replace(/\/+$/, '');

    if (!portalBase) {
      // Mirrors DashboardNotifierService's ADMIN_BASE_URL handling: don't
      // fail the invite over a missing deep-link config, just log loudly so
      // it's discoverable instead of silently mailing a dead link.
      this.logger.error(
        `PORTAL_URL is not configured — invite email to ${user.email} will carry no working link`,
      );
    }

    const acceptUrl = portalBase
      ? `${portalBase}/accept-invite?uid=${user._id}&token=${rawToken}`
      : '#';

    await this.mail.sendInviteEmail({
      to: user.email,
      firstName: user.firstName,
      acceptUrl,
      ttlHours,
      inviterOrg: inviterOrgName,
    });
  }

  /**
   * `hashedToken` must already be bcrypt-hashed by the caller (mirrors
   * verifyOtp). Looks up by id rather than a query on the token itself, so
   * comparison always happens in application code against a value the caller
   * cannot influence the shape of.
   */
  async verifyInviteToken(userId: string, rawToken: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+inviteToken +inviteTokenExpires');

    if (!user?.inviteToken || !user.inviteTokenExpires) return null;
    if (user.inviteTokenExpires.getTime() <= Date.now()) return null;

    const matches = await bcrypt.compare(rawToken, user.inviteToken);
    return matches ? user : null;
  }

  async clearInviteToken(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { inviteToken: 1, inviteTokenExpires: 1 } },
    );
  }

  /**
   * Completes accept-invite: sets the chosen password, activates the
   * account, and clears the (now-used) invite token in one write so a crash
   * between steps can't leave the account active with no password, or
   * password-set but still inactive.
   */
  async activateWithPassword(userId: string, hashedPassword: string) {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        password: hashedPassword,
        isActive: true,
        $unset: { inviteToken: 1, inviteTokenExpires: 1 },
      },
      { new: true },
    );
  }
}
