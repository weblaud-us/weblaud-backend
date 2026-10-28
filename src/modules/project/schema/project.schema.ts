import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectDocument = Project & Document;

/**
 * How a portfolio record may be presented in public.
 *
 * - `draft` — CMS only. Never listed, linked, fed to search/LLM feeds or
 *   served by the public detail route.
 * - `illustrative` — an architectural example of work we can do. Public, but
 *   labelled as illustrative; it must not carry outcome figures or present
 *   itself as delivered client work.
 * - `verified` — delivered work with supporting evidence and the client's
 *   permission to publish, recorded in `evidenceNotes`.
 *
 * Records written before this field existed have no value; every read treats
 * that as `draft` so nothing is published by omission.
 */
export const PUBLICATION_STATUSES = [
  'draft',
  'illustrative',
  'verified',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export const PUBLISHED_STATUSES: PublicationStatus[] = [
  'illustrative',
  'verified',
];

/** Internal-only fields: stripped from every public projection. */
export const PROJECT_INTERNAL_FIELDS = ['evidenceNotes'] as const;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, unique: true, sparse: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  featureList: string[];

  @Prop({ type: [String], default: [] })
  detailImages: string[];

  @Prop()
  coverImage: string;

  @Prop({ default: '' })
  coverImageAlt: string;

  @Prop({ default: '' })
  problem: string;

  @Prop({ default: '' })
  solution: string;

  @Prop({ type: [String], default: [] })
  techStack: string[];

  @Prop({ default: '' })
  businessImpact: string;

  @Prop({ type: String, enum: PUBLICATION_STATUSES, default: 'draft' })
  publicationStatus: PublicationStatus;

  /**
   * Admin-only record of the evidence and publication permission behind a
   * `verified` study (who approved, where the figures come from), or why an
   * example is illustrative. Never returned by a public endpoint.
   */
  @Prop({ default: '' })
  evidenceNotes: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ publicationStatus: 1, createdAt: -1 });
