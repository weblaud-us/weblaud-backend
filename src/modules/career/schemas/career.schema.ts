import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CareerDocument = Career & Document;

@Schema({ timestamps: true })
export class Career {
  @Prop({ required: true })
  title: string; // e.g. "UI/UX Designer"

  @Prop({ required: true })
  position: string; // e.g. "Junior" or "3 positions"

  @Prop({ required: true })
  jobDetails: string; // FULL details in HTML or long text

  @Prop({ default: true })
  isActive: boolean;
}

export const CareerSchema = SchemaFactory.createForClass(Career);
