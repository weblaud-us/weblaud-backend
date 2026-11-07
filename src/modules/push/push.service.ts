import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import {
  PushSubscriptionDocument,
  PushSubscriptionRecord,
} from './schemas/push-subscription.schema';
import { SubscribePushDto } from './dto/push-subscription.dto';

export interface PushPayload {
  title: string;
  body?: string;
  /** Portal path opened when the notification is clicked, e.g. /portal/projects/123/updates. */
  link?: string;
  /** Notifications with the same tag replace each other on the device instead of stacking. */
  tag?: string;
}

/**
 * Web Push (VAPID) delivery for the client portal PWA. Works on Android,
 * desktop browsers, and iOS 16.4+ once the portal is added to the Home Screen.
 *
 * Optional by design: without VAPID keys every call is a no-op (logged once at
 * boot), so a missing key never breaks notify() or the request behind it.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    @InjectModel(PushSubscriptionRecord.name)
    private readonly model: Model<PushSubscriptionDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('push.vapidPublicKey');
    const privateKey = this.config.get<string>('push.vapidPrivateKey');
    const subject = this.config.get<string>('push.vapidSubject');
    if (!publicKey || !privateKey || !subject) {
      this.logger.warn(
        'Push notifications disabled: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (npx web-push generate-vapid-keys).',
      );
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        'Push notifications disabled: invalid VAPID configuration',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** The key browsers need to subscribe; null when push is off server-side. */
  publicKey(): string | null {
    return this.enabled
      ? (this.config.get<string>('push.vapidPublicKey') ?? null)
      : null;
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    // Upsert by endpoint: re-subscribing the same browser (or a different
    // user logging in on a shared device) moves the row instead of duplicating it.
    await this.model.updateOne(
      { endpoint: dto.endpoint },
      {
        $set: {
          user: new Types.ObjectId(userId),
          keys: dto.keys,
          userAgent: dto.userAgent,
        },
      },
      { upsert: true },
    );
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.model.deleteOne({ endpoint, user: new Types.ObjectId(userId) });
    return { subscribed: false };
  }

  /**
   * Sends to every device the user turned push on for. Never rejects — same
   * contract as NotificationService.notify, which calls this as a side effect.
   */
  async sendToUser(
    userId: string | Types.ObjectId,
    payload: PushPayload,
  ): Promise<void> {
    if (!this.enabled) return;
    try {
      const subs = await this.model
        .find({ user: new Types.ObjectId(userId.toString()) })
        .lean();
      if (subs.length === 0) return;

      const body = JSON.stringify(payload);
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              body,
              { TTL: 60 * 60 * 24, urgency: 'normal' },
            );
            await this.model.updateOne(
              { _id: sub._id },
              { $set: { lastSuccessAt: new Date() } },
            );
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              // The browser revoked or expired this subscription.
              await this.model.deleteOne({ _id: sub._id });
            } else {
              this.logger.warn(
                `Push to ${new URL(sub.endpoint).host} failed (${status ?? 'network'})`,
              );
            }
          }
        }),
      );
    } catch (err) {
      this.logger.error(
        `Push delivery for user ${userId.toString()} failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
