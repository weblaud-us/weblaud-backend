import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CareerDocument = Career & Document;

@Schema({ timestamps: true })
export class Career {
  // Public job pages are addressed by slug (/career/ux-ui-designer) rather than
  // ObjectId, matching how projects and insights are linked.
  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true })
  title: string; // e.g. "UI/UX Designer"

  @Prop({ required: true })
  position: string; // e.g. "Junior" or "3 positions"

  @Prop({ default: '' })
  summary: string; // one-line blurb shown on the listing card

  @Prop({ default: '' })
  department: string; // e.g. "Design", "Marketing"

  @Prop({ default: '' })
  location: string; // e.g. "Remote · Dhaka, Bangladesh"

  @Prop({ default: '' })
  jobType: string; // "Full-time" | "Part-time" | "Contract" | "Internship"

  @Prop({ default: '' })
  experience: string; // e.g. "2-4 years"

  @Prop({ default: '' })
  salaryRange: string; // e.g. "Negotiable"

  @Prop()
  deadline?: Date;

  @Prop({ type: [String], default: [] })
  responsibilities: string[];

  @Prop({ type: [String], default: [] })
  requirements: string[];

  // Long-form "About the role" copy. Optional now that the structured fields
  // above carry the circular — a posting built only from those must still save.
  @Prop({ default: '' })
  jobDetails: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const CareerSchema = SchemaFactory.createForClass(Career);
