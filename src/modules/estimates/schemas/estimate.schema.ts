import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EstimateDocument = Estimate & Document;

/**
 * Titles/labels are stored alongside the ids so a later rate edit in the admin
 * CMS does not silently rewrite what a lead actually selected.
 */
@Schema({ _id: false })
export class EstimateSelectionSnapshot {
  @Prop({ required: true })
  projectTypeId: string;

  @Prop({ required: true })
  projectTypeTitle: string;

  @Prop({ type: [String], default: [] })
  featureIds: string[];

  @Prop({ type: [String], default: [] })
  featureTitles: string[];

  @Prop({ required: true })
  speedId: string;

  @Prop({ required: true })
  speedLabel: string;
}

@Schema({ _id: false })
export class EstimateComputedResult {
  @Prop({ required: true })
  totalWeeks: number;

  @Prop({ required: true })
  costMin: number;

  @Prop({ required: true })
  costMax: number;
}

@Schema({ timestamps: true })
export class Estimate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  company: string;

  @Prop()
  phone: string;

  @Prop()
  notes: string;

  @Prop({ type: EstimateSelectionSnapshot, required: true })
  selection: EstimateSelectionSnapshot;

  @Prop({ type: EstimateComputedResult, required: true })
  result: EstimateComputedResult;

  @Prop({ default: 'new', enum: ['new', 'read'] })
  status: string;
}

export const EstimateSchema = SchemaFactory.createForClass(Estimate);
