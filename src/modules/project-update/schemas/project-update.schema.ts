import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectUpdateDocument = ProjectUpdate & Document;

export enum ProjectUpdateType {
  PROGRESS = 'progress',
  MILESTONE = 'milestone',
  GENERAL = 'general',
}

export enum ProjectUpdateStatus {
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
}

/**
 * The Developer → PM → Client update flow. A PM (or admin) posting an
 * update publishes immediately; a developer's post starts as
 * PENDING_REVIEW and needs a PM's approve/reject before a client ever sees
 * it. See ProjectUpdateService for the full state machine and
 * project-access.util.ts#projectAuthorRole for how authorRole is decided.
 */
@Schema({ timestamps: true })
export class ProjectUpdate {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  // Snapshotted at creation — if a developer later becomes the PM (or vice
  // versa) on this project, past updates still read as what the author was
  // when they wrote it, not what they are now.
  @Prop({ enum: ['pm', 'developer'], required: true })
  authorRole: 'pm' | 'developer';

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ enum: ProjectUpdateType, default: ProjectUpdateType.PROGRESS })
  type: ProjectUpdateType;

  // Narrative only — the author's "roughly where we are" estimate, shown on
  // the update card. It never writes ClientProject.progress, which comes
  // from the task board alone (TaskService.recomputeProgress).
  @Prop({ min: 0, max: 100 })
  progressValue?: number;

  @Prop({
    enum: ProjectUpdateStatus,
    default: ProjectUpdateStatus.PUBLISHED,
  })
  status: ProjectUpdateStatus;

  @Prop()
  reviewNote?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  publishedAt?: Date;
}

export const ProjectUpdateSchema = SchemaFactory.createForClass(ProjectUpdate);

ProjectUpdateSchema.index({ project: 1, status: 1, createdAt: -1 });
