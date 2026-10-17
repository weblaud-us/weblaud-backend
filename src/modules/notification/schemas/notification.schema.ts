import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  // Must be Schema.Types.ObjectId, not Types.ObjectId (the value constructor)
  // — see the note on Application.careerId in
  // career/schemas/application.schema.ts. findForUser filters on this field
  // directly, so getting it wrong would make every notification query
  // silently return nothing.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  /** Short machine tag, e.g. "project_update", "invoice_paid", "approval_requested". Drives icon/routing client-side. */
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  body: string;

  /** Portal-relative path the notification should navigate to when clicked. */
  @Prop()
  link?: string;

  @Prop({ default: false })
  read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });
