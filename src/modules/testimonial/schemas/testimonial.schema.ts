import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TestimonialDocument = Testimonial & Document;

@Schema({ timestamps: true })
export class Testimonial {
  @Prop({ required: true })
  quote: string; // “So we built a platform…”

  @Prop({ required: true })
  authorName: string; // John Doe

  @Prop({ required: true })
  authorTitle: string; // Founder & CEO

  @Prop({ default: true })
  isActive: boolean; // for showing/hiding in slider
}

export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);
