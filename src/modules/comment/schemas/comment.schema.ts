import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

export enum CommentSubjectType {
  /** General project-level discussion — no subjectId. */
  PROJECT = 'project',
  TASK = 'task',
  FILE = 'file',
}

/**
 * A generic threaded comment, reused across every commentable surface
 * instead of a bespoke schema per subject (Phase 7). Deliberately does NOT
 * absorb UpdateRequest (client "what's the status?" questions) — that
 * already has its own working status machine (open/answered/closed) wired
 * into AnalyticsService's actionRequired count, and folding it into a
 * shape with no status field of its own would be a real behavior change,
 * not a refactor. See CommentService's doc comment for the access rules
 * per subjectType.
 */
@Schema({ timestamps: true })
export class Comment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ enum: CommentSubjectType, required: true })
  subjectType: CommentSubjectType;

  /** Required for TASK/FILE, absent for PROJECT (there's nothing more specific than the project itself to point at). */
  @Prop({ type: MongooseSchema.Types.ObjectId })
  subjectId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true })
  body: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] })
  mentions: Types.ObjectId[];

  // Staff-only side note, invisible to clients even on a subject (a
  // client-visible file, a general project thread) they can otherwise read
  // and post to. Only staff can set this — see CreateCommentDto.
  @Prop({ default: false })
  internal: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Comment' })
  parent?: Types.ObjectId;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ project: 1, subjectType: 1, subjectId: 1, createdAt: 1 });
