import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';

export type UserDocument = User & Document;

/**
 * Per-user opt-outs for the transactional emails NotificationService fans
 * out alongside in-app notifications (see NotificationService.notify's
 * `email` option). All default true — email is on until a client turns a
 * category off from Settings or an unsubscribe link. Keyed to match the
 * `category` values NotificationService's call sites pass, not the
 * `type` tag on individual notifications (several types share a category,
 * e.g. invoice_sent/invoice_overdue both gate on `invoices`).
 */
@Schema({ _id: false })
export class EmailPreferences {
  @Prop({ default: true })
  contracts: boolean;

  @Prop({ default: true })
  invoices: boolean;

  @Prop({ default: true })
  approvals: boolean;

  @Prop({ default: true })
  changeRequests: boolean;

  @Prop({ default: true })
  updates: boolean;

  /** @mentions in a comment thread (Phase 7) — see CommentService.notifyMentions. */
  @Prop({ default: true })
  mentions: boolean;

  /** The Monday summary of a project's week — see ProjectDigestService. */
  @Prop({ default: true })
  digest: boolean;
}
export const EmailPreferencesSchema =
  SchemaFactory.createForClass(EmailPreferences);

@Schema({ timestamps: true })
export class User {
  _id: any;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ unique: true, required: true })
  email: string;

  // Optional: an invited-but-not-yet-accepted user (client or staff) has no
  // password until they go through /auth/accept-invite and set one.
  // isActive stays false the whole time, so JwtAccessStrategy already refuses
  // to authenticate as this user before that happens — required:true would
  // block the invite record from ever being created in the first place.
  @Prop({ select: false })
  password?: string;

  // type: String is explicit so the schema doesn't depend on emitted decorator
  // metadata for an imported enum (ts-jest compiles files in isolation and
  // emits the enum object instead of String, which @nestjs/mongoose rejects).
  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  // hashed refresh token
  @Prop({ select: false })
  refreshToken?: string;

  // Bcrypt hash of the password-reset OTP, never the code itself. select:false
  // keeps both out of every user response by default — they were previously
  // returned by GET /users/me and any other endpoint echoing a user document.
  @Prop({ select: false })
  otpCode?: string;

  @Prop({ select: false })
  otpExpires?: Date;

  // Wrong guesses against the current otpCode — see UsersService.verifyOtp,
  // which discards the code once this reaches MAX_OTP_ATTEMPTS.
  @Prop({ select: false })
  otpAttempts?: number;

  // Bcrypt hash of the invite acceptance token, mirroring otpCode/otpExpires
  // above. Cleared once the invite is accepted (or a fresh one is issued by
  // resend-invite).
  @Prop({ select: false })
  inviteToken?: string;

  @Prop({ select: false })
  inviteTokenExpires?: Date;

  // Client users belong to exactly one Organization (their company); staff
  // (ADMIN/MANAGER) leave this unset. orgRole only matters when organization
  // is set — it gates money/approval/people-management actions in the portal.
  // Must be Schema.Types.ObjectId, not Types.ObjectId (the value constructor)
  // — see the note on Application.careerId in
  // career/schemas/application.schema.ts. Getting this wrong registers the
  // path as Mixed, so every `{ organization: user.organization }` portal
  // query silently stops matching.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Organization' })
  organization?: Types.ObjectId;

  @Prop({ type: String, enum: OrgRole })
  orgRole?: OrgRole;

  @Prop()
  avatar?: string;

  @Prop({ default: '' })
  title?: string;

  @Prop({ default: '' })
  phone?: string;

  // Deprecated — superseded by costRate/billRate below. No DTO has ever
  // exposed this field for writing (checked: CreateUserDto, UpdateUserDto,
  // InviteUserDto never carried it), so it should be empty in every real
  // deployment, but it's left declared rather than dropped until that's
  // confirmed against production (`db.users.countDocuments({hourlyRate:
  // {$exists:true}})`) — a silent rename could otherwise move a legacy
  // value with no signal. Nothing reads or writes it anymore.
  @Prop({ select: false })
  hourlyRate?: number;

  // Staff-only, split in two: costRate is what this person actually costs
  // the agency (Σ hours × costRate feeds the profitability calc — see
  // AnalyticsService.computeProjectLaborRollup), billRate is what a client
  // is charged for their time (see TimeEntryService.generateInvoice). These
  // are deliberately different numbers — putting costRate on a client-facing
  // invoice would hand them the agency's internal margin. Neither is ever
  // exposed to a client; billRate only ever reaches them baked into an
  // invoice's line-item total, never as a labeled rate.
  @Prop({ select: false })
  costRate?: number;

  @Prop({ select: false })
  billRate?: number;

  // Set by AuthService.login on every successful sign-in. Was previously
  // written by UsersService.updateLastLogin without existing on this schema
  // at all — Mongoose's default strict:true silently dropped the field, so
  // the write was a no-op and, separately, nothing ever called that method.
  // Both are fixed now: the field exists, and login() calls it.
  @Prop()
  lastLogin?: Date;

  @Prop({ type: EmailPreferencesSchema, default: () => ({}) })
  emailPreferences: EmailPreferences;

  comparePassword: (password: string) => Promise<boolean>;
}

export const UserSchema = SchemaFactory.createForClass(User);

/**
 * Secrets that must never leave the server, even when a query explicitly
 * selected them (login reads +password, JwtAccessStrategy reads
 * +refreshToken). select:false only keeps them out of queries that don't ask
 * for them — once selected, a returned document serialized them straight into
 * the response: the login response carried the bcrypt password hash and
 * /users/me the refresh-token hash. Auth code reads these fields off the
 * document directly and never needs them serialized; save() uses Mongoose's
 * internal transform-free serialization, so writes are unaffected.
 */
export const USER_SECRET_FIELDS = [
  'password',
  'refreshToken',
  'otpCode',
  'otpExpires',
  'otpAttempts',
  'inviteToken',
  'inviteTokenExpires',
] as const;

function stripSecrets<T extends Partial<User>>(_doc: unknown, ret: T): T {
  for (const field of USER_SECRET_FIELDS) delete ret[field];
  return ret;
}

UserSchema.set('toJSON', { transform: stripSecrets });
UserSchema.set('toObject', { transform: stripSecrets });

// Add method
UserSchema.methods.comparePassword = async function (plain: string) {
  // An invited user who hasn't accepted yet has no password hash at all.
  // bcrypt.compare() throws on an undefined hash rather than returning
  // false, which would otherwise turn "log in before accepting your invite"
  // into a 500 instead of the intended "Invalid credentials".
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};
