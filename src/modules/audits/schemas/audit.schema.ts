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

export type AuditDocument = Audit & Document;

export const AUDIT_STRATEGIES = ['mobile', 'desktop'] as const;
export type AuditStrategy = (typeof AUDIT_STRATEGIES)[number];

export const AUDIT_RUN_STATUSES = ['running', 'done', 'failed'] as const;
export type AuditRunStatus = (typeof AUDIT_RUN_STATUSES)[number];

/** Lighthouse category scores, 0–100. */
@Schema({ _id: false })
export class AuditScores {
  @Prop({ required: true })
  performance: number;

  @Prop({ required: true })
  seo: number;

  @Prop({ required: true })
  accessibility: number;

  @Prop({ required: true })
  bestPractices: number;
}

/** Lab Core Web Vitals. Missing when Lighthouse couldn't measure one. */
@Schema({ _id: false })
export class AuditVitals {
  @Prop()
  lcpMs?: number;

  @Prop()
  cls?: number;

  @Prop()
  tbtMs?: number;

  @Prop()
  fcpMs?: number;
}

@Schema({ _id: false })
export class AuditIssue {
  /** Lighthouse audit id, e.g. "render-blocking-resources". */
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  displayValue?: string;

  /** Estimated time saved if fixed — performance issues only. */
  @Prop()
  savingsMs?: number;

  @Prop({ required: true })
  category: string;
}

/**
 * A website audit run from /audit. Starts anonymous (URL + results only) and
 * becomes a lead when the visitor claims the full report with their contact
 * details — admin lists, the follow-up digest and dashboard counts only ever
 * look at claimed audits (`email` set).
 */
@Schema({ timestamps: true })
export class Audit {
  /** Normalized URL as audited — see normalizeAuditUrl(). */
  @Prop({ required: true, index: true })
  url: string;

  @Prop({ required: true })
  host: string;

  @Prop({ type: String, required: true, enum: AUDIT_STRATEGIES })
  strategy: AuditStrategy;

  @Prop({ type: String, default: 'running', enum: AUDIT_RUN_STATUSES })
  runStatus: AuditRunStatus;

  /** Short machine-readable reason, e.g. "quota", "unreachable". */
  @Prop()
  failureReason?: string;

  @Prop({ type: SchemaFactory.createForClass(AuditScores) })
  scores?: AuditScores;

  @Prop({ type: SchemaFactory.createForClass(AuditVitals) })
  vitals?: AuditVitals;

  @Prop({ type: [SchemaFactory.createForClass(AuditIssue)], default: [] })
  issues: AuditIssue[];

  @Prop()
  completedAt?: Date;

  // --- Contact (set when the visitor claims the full report) ---

  @Prop()
  name?: string;

  @Prop({ index: true, sparse: true })
  email?: string;

  @Prop()
  company?: string;

  @Prop()
  claimedAt?: Date;

  // --- Lead handling, same fields as contact messages and estimates ---

  @Prop({ default: 'new', enum: ['new', 'read'] })
  status: string;

  @Prop({ type: String, default: 'new', enum: LEAD_STAGES })
  stage: LeadStage;

  /** Admin-only notes on the deal — never shown to the lead. */
  @Prop()
  internalNotes?: string;

  @Prop()
  nextFollowUpAt?: Date;

  @Prop()
  lostReason?: string;

  @Prop({ type: LeadAttributionSchema })
  attribution?: LeadAttribution;

  @Prop({ enum: HEARD_ABOUT_OPTIONS })
  heardAbout?: string;

  /** When the emailed report went out, if it did. */
  @Prop()
  autoReplySentAt?: Date;
}

export const AuditSchema = SchemaFactory.createForClass(Audit);
