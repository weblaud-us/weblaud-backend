import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ApprovalDocument = Approval & Document;

export enum ApprovalSubjectType {
  DELIVERABLE = 'deliverable',
  MILESTONE = 'milestone',
  CHANGE_REQUEST = 'change_request',
  INVOICE = 'invoice',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * A formal, timestamped client sign-off — the record that ends "I never
 * agreed to that" disputes. Deliberately generic (subjectType/subjectId)
 * rather than one schema per approvable thing: a milestone approval and a
 * deliverable approval are the same shape (something to review, a decision,
 * a comment), and every consumer only ever needs the subject loosely
 * referenced for a link/label — nothing here joins across it in a query.
 */
@Schema({ timestamps: true })
export class Approval {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ enum: ApprovalSubjectType, required: true })
  subjectType: ApprovalSubjectType;

  // Loosely referenced on purpose — subjectType decides which collection it
  // points at, and no query here ever needs to join across it.
  @Prop({ type: MongooseSchema.Types.ObjectId })
  subjectId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requestedBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  decidedBy?: Types.ObjectId;

  @Prop()
  decidedAt?: Date;

  @Prop()
  comment?: string;
}

export const ApprovalSchema = SchemaFactory.createForClass(Approval);

ApprovalSchema.index({ project: 1, status: 1, createdAt: -1 });
