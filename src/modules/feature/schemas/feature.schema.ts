import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FeatureDocument = Feature & Document;

export enum FeatureStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

/**
 * Was a subdocument array on ClientProject (`ClientProject.features`) —
 * promoted to its own collection so Task.feature has a real, stable id to
 * reference across a collection boundary (a subdocument's _id works too,
 * but every other cross-entity link in this codebase is a top-level
 * collection ref, and Mongoose's populate() only works cleanly against
 * one). Done while data volume is small, per the plan. See
 * FeatureService.replaceForProject for how the portal/admin editors — which
 * still edit the whole list as one save — map onto real CRUD underneath.
 */
@Schema({ timestamps: true })
export class Feature {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ enum: FeatureStatus, default: FeatureStatus.PLANNED })
  status: FeatureStatus;

  /** Display order within the project — lower first. Set by FeatureService.replaceForProject from array position. */
  @Prop({ default: 0 })
  order: number;
}

export const FeatureSchema = SchemaFactory.createForClass(Feature);

FeatureSchema.index({ project: 1, order: 1 });
