import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { MailService } from 'src/modules/mail/mail.service';
import { UsersService } from 'src/modules/users/users.service';
import { signUnsubscribeToken } from 'src/common/utils/email-preference-token.util';
import { siteUrl } from 'src/common/utils/site-url.util';

/** Matches the boolean keys on User.emailPreferences (see user.schema.ts). */
export type EmailCategory =
  | 'contracts'
  | 'invoices'
  | 'approvals'
  | 'changeRequests'
  | 'updates'
  | 'mentions';

export interface CreateNotificationInput {
  user: string | Types.ObjectId;
  type: string;
  title: string;
  body?: string;
  link?: string;
  /**
   * Opt-in transactional email alongside the in-app row — most notify()
   * calls omit this and stay in-app only. `context` is entity-specific
   * (invoice number, contract title, ...); the recipient's first name and
   * an unsubscribe link are added automatically in dispatchEmail, so
   * callers never need to know who's on the other end of a notifyMany fan-out.
   */
  email?: {
    category: EmailCategory;
    subject: string;
    template: string;
    context?: Record<string, unknown>;
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly model: Model<NotificationDocument>,
    private readonly mail: MailService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Never rejects, same reasoning as AuditLogService.record: this fires as a
   * side effect of a real write (an update was posted, an invoice got paid)
   * and must not turn a notification-delivery hiccup into a failed request
   * for the action that actually mattered. The optional email dispatch below
   * carries the same guarantee.
   */
  async notify(input: CreateNotificationInput): Promise<void> {
    const { email, ...record } = input;

    try {
      await this.model.create(record);
    } catch (err) {
      this.logger.error(
        `Failed to create notification for user ${input.user}`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    if (email) {
      await this.dispatchEmail(input.user, email, input.link);
    }
  }

  /** Fan-out helper for events that notify more than one person (e.g. a client update notifies the whole team). */
  async notifyMany(
    userIds: (string | Types.ObjectId)[],
    input: Omit<CreateNotificationInput, 'user'>,
  ) {
    await Promise.all(userIds.map((user) => this.notify({ ...input, user })));
  }

  /**
   * Looks the recipient up for their email + per-category preference,
   * respects an opt-out, and sends via MailService. Isolated from notify()'s
   * try/catch above so a missing user or an SMTP failure here can never
   * surface as a failure of the (already-succeeded) in-app notification.
   */
  private async dispatchEmail(
    userId: string | Types.ObjectId,
    email: NonNullable<CreateNotificationInput['email']>,
    link?: string,
  ): Promise<void> {
    try {
      const user = await this.users.findOne(userId.toString());
      if (!user?.email) return;

      const preferences = user.emailPreferences as
        | Record<EmailCategory, boolean>
        | undefined;
      if (preferences?.[email.category] === false) return;

      const secret = this.config.get<string>('mail.unsubscribeSecret');
      const portalBase = this.config.get<string>('portal.baseUrl');
      // siteUrl, not string concatenation: PORTAL_URL already ends in
      // /portal and every link starts with /portal/, so concatenating them
      // produced /portal/portal/... — a 404 in every email. The unsubscribe
      // page lives at the site root, not under /portal.
      const unsubscribeUrl = secret
        ? siteUrl(
            portalBase,
            `/email-preferences/unsubscribe?${new URLSearchParams({
              uid: userId.toString(),
              token: signUnsubscribeToken(userId.toString(), secret),
              category: email.category,
            })}`,
          )
        : undefined;
      // Same deep link the in-app notification navigates to on click —
      // reusing `link` rather than threading a second URL through every
      // call site keeps the two channels pointed at the same place by
      // construction instead of by callers remembering to match them.
      const actionUrl = siteUrl(portalBase, link ?? '/portal');

      await this.mail.sendEmail({
        to: user.email,
        subject: email.subject,
        template: email.template,
        context: {
          ...email.context,
          firstName: user.firstName,
          actionUrl,
          unsubscribeUrl,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to send notification email to user ${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async findForUser(userId: string, unreadOnly = false) {
    const query: Record<string, unknown> = { user: userId };
    if (unreadOnly) query.read = false;

    return this.model.find(query).sort({ createdAt: -1 }).limit(100).lean();
  }

  /** Cheap poll target for the portal bell badge — see PortalNotificationsCount route. */
  async countUnread(userId: string): Promise<number> {
    return this.model.countDocuments({ user: userId, read: false });
  }

  async markRead(userId: string, id: string) {
    await this.model.updateOne({ _id: id, user: userId }, { read: true });
  }

  async markAllRead(userId: string) {
    await this.model.updateMany({ user: userId, read: false }, { read: true });
  }
}
