import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscriptionRecord & Document;

/**
 * One browser/device a portal user turned push notifications on for. A user
 * can have several (phone + laptop). Rows are deleted when the push service
 * answers 404/410 — the browser dropped the subscription — or when the user
 * turns push off on that device.
 */
@Schema({ collection: 'pushsubscriptions', timestamps: true })
export class PushSubscriptionRecord {
  // Schema.Types.ObjectId, not Types.ObjectId — see the note on
  // Application.careerId in career/schemas/application.schema.ts.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: Types.ObjectId;

  /** The push service URL; unique per browser subscription. */
  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({
    type: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    required: true,
    _id: false,
  })
  keys: { p256dh: string; auth: string };

  @Prop()
  userAgent?: string;

  @Prop()
  lastSuccessAt?: Date;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(
  PushSubscriptionRecord,
);
