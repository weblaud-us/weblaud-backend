import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TaskDocument = Task & Document;

export enum TaskStatus {
  BACKLOG = 'backlog',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
}

/**
 * The task board (Phase 6). `order` is per-status-column position (see
 * TaskService.reorder) — a plain integer, not a fractional/lexicographic
 * key, since reorder always rewrites every affected row's order in one call
 * rather than trying to slot a single move in between two neighbors.
 */
@Schema({ timestamps: true })
export class Task {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Feature' })
  feature?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ enum: TaskStatus, default: TaskStatus.BACKLOG })
  status: TaskStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignee?: Types.ObjectId;

  @Prop()
  dueDate?: Date;

  @Prop()
  estimateHours?: number;

  @Prop({ default: 0 })
  order: number;

  // Whether a client sees this row on their (read-only) board — staff can
  // keep internal/exploratory tasks off the client-facing view. Defaults
  // true: most work is fine for a client to see, and a PM has to actively
  // hide something rather than everything defaulting to hidden.
  @Prop({ default: true })
  clientVisible: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ project: 1, status: 1, order: 1 });
