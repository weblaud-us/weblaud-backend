import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  ACCEPTED_BUDGET_OPTIONS,
  HEARD_ABOUT_OPTIONS,
  LEAD_STAGES,
  TIMELINE_OPTIONS,
  type LeadStage,
} from '../../leads/lead.constants';
import {
  LeadAttribution,
  LeadAttributionSchema,
} from '../../leads/schemas/lead-attribution.schema';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone: string;

  @Prop({ required: true })
  message: string;

  // --- Optional qualifiers (visitor-supplied; see leads/lead.constants.ts) ---

  @Prop({ enum: ACCEPTED_BUDGET_OPTIONS })
  budget?: string;

  @Prop({ enum: TIMELINE_OPTIONS })
  timeline?: string;

  // `spam`: caught by classifySubmission — stored without notifying anyone so
  // an admin can still recover a false positive (PATCH admin/:id/not-spam).
  @Prop({ default: 'new', enum: ['new', 'read', 'spam'] })
  status: string;

  /** Why a submission was classified as spam — shown to the admin reviewing it. */
  @Prop()
  spamReason?: string;

  // --- Sales pipeline (admin-managed; see leads/lead.constants.ts) ---

  @Prop({ type: String, default: 'new', enum: LEAD_STAGES })
  stage: LeadStage;

  /** Admin-only notes on the deal — never shown to the lead. */
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

  /** When the automatic "we got your message" reply went out, if it did. */
  @Prop()
  autoReplySentAt?: Date;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
