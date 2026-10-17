import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ClientProjectDocument = ClientProject & Document;

export enum ClientProjectStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

// FeatureStatus moved to feature/schemas/feature.schema.ts — ProjectFeature
// used to be a subdocument here (`ClientProject.features`), promoted to its
// own `Feature` collection so cross-collection refs (Task.feature) have a
// real id to point at. See feature.module.ts.

@Schema({ _id: false })
export class ProjectBudget {
  @Prop({ required: true, default: 0 })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  // Sum of paid invoices against this project — kept denormalized here
  // (rather than aggregated on every read) so the overview page and the
  // owner analytics dashboard are a single document read, not a fan-out
  // query across the invoice collection. InvoiceService updates it when an
  // invoice is marked paid.
  @Prop({ default: 0 })
  spent: number;
}
export const ProjectBudgetSchema = SchemaFactory.createForClass(ProjectBudget);

@Schema()
export class ProjectMilestone {
  @Prop({ required: true })
  title: string;

  @Prop()
  dueDate?: Date;

  @Prop({ enum: MilestoneStatus, default: MilestoneStatus.PENDING })
  status: MilestoneStatus;

  @Prop()
  completedAt?: Date;
}
export const ProjectMilestoneSchema =
  SchemaFactory.createForClass(ProjectMilestone);

@Schema({ _id: false })
export class ProjectTimeline {
  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ type: [ProjectMilestoneSchema], default: [] })
  milestones: ProjectMilestone[];
}
export const ProjectTimelineSchema =
  SchemaFactory.createForClass(ProjectTimeline);

@Schema({ timestamps: true })
export class ClientProject {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ enum: ClientProjectStatus, default: ClientProjectStatus.PLANNING })
  status: ClientProjectStatus;

  // Must be Schema.Types.ObjectId, not Types.ObjectId — see the note on
  // Application.careerId in career/schemas/application.schema.ts. Passing the
  // value-constructor here silently registers the path as Mixed: nothing
  // casts query values to ObjectId, so every membership query in
  // ClientProjectService.findForPortalUser (staff PM/team lookup) and every
  // assertProjectAccess() comparison against a populated field would fail
  // quietly with zero results instead of an error.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  })
  organization: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  projectManager: Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] })
  team: Types.ObjectId[];

  @Prop({ type: ProjectBudgetSchema, default: () => ({}) })
  budget: ProjectBudget;

  @Prop({ type: ProjectTimelineSchema, default: () => ({}) })
  timeline: ProjectTimeline;

  // Derived, not hand-entered: TaskService recomputes this (estimate-weighted
  // done/total across the project's tasks) after every task create/update/
  // delete/reorder — see TaskService.recomputeProgress and
  // ClientProjectService.applyProgress. A project with no tasks yet just
  // stays at whatever it was (0 for a new one). The task board is the ONLY
  // writer: a project update's progressValue is narrative and shown on the
  // update card only, so the number a client sees never moves backwards
  // because an update and the board disagreed.
  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  @Prop()
  coverImage?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  // When the weekly client digest last went out for this project. Claimed
  // atomically before sending (ProjectDigestService), so a restart or a
  // second instance can't send the same week twice.
  @Prop()
  lastDigestAt?: Date;
}

export const ClientProjectSchema = SchemaFactory.createForClass(ClientProject);
