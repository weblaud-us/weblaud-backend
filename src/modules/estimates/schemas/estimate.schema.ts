import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  HEARD_ABOUT_OPTIONS,
  LEAD_STAGES,
  type LeadStage,
} from '../../leads/lead.constants';
import {
  LeadAttribution,
  LeadAttributionSchema,
} from '../../leads/schemas/lead-attribution.schema';

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

  // --- Sales pipeline (admin-managed; see leads/lead.constants.ts) ---

  @Prop({ type: String, default: 'new', enum: LEAD_STAGES })
  stage: LeadStage;

  /**
   * Admin-only notes on the deal — never shown to the lead. Not `notes`:
   * that field is what the lead wrote on the form.
   */
  @Prop()
  internalNotes?: string;

  @Prop()
  nextFollowUpAt?: Date;

  @Prop()
  lostReason?: string;

  // --- Where the lead came from (visitor-supplied) ---

  @Prop({ type: LeadAttributionSchema })
  attribution?: LeadAttribution;

  @Prop({ enum: HEARD_ABOUT_OPTIONS })
  heardAbout?: string;

  /** When the emailed copy of the estimate went out, if it did. */
  @Prop()
  autoReplySentAt?: Date;
}

export const EstimateSchema = SchemaFactory.createForClass(Estimate);
