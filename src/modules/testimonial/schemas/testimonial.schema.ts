import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TestimonialDocument = Testimonial & Document;

@Schema({ timestamps: true })
export class Testimonial {
  @Prop({ required: true })
  quote: string; // “So we built a platform…” — published verbatim

  @Prop({ required: true })
  authorName: string; // John Doe

  @Prop({ default: '' })
  authorTitle: string; // Founder & CEO

  @Prop({ default: '' })
  company: string; // shown only when the author supplied it

  /** Where the quote was originally given (a public review, a post). */
  @Prop({ default: '' })
  sourceUrl: string;

  @Prop({ default: true })
  isActive: boolean; // for showing/hiding in slider

  /**
   * Off until someone has confirmed the quote is genuine and the author agreed
   * to its publication. Public reads require it as well as `isActive`; records
   * written before the field existed read as unapproved.
   */
  @Prop({ default: false })
  publicationApproved: boolean;

  /** Internal: who confirmed the quote and permission, and how. Never public. */
  @Prop({ default: '' })
  evidenceNote: string;
}

export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);
