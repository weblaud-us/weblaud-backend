import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AboutInfoDocument = AboutInfo & Document;

@Schema({ timestamps: true })
export class AboutInfo {
  @Prop({ default: false })
  isActive: boolean; // Toggle section visibility

  @Prop()
  story: string;

  @Prop()
  mission: string;

  @Prop({
    type: Object,
    default: {
      clients: 0,
      projects: 0,
      successRate: 0,
      followers: 0,
      experienceYears: 0,
    },
  })
  stats: Record<string, number>;

  @Prop({
    type: Array,
    default: [],
  })
  trackRecord: {
    title: string; // e.g. "12+"
    subtitle: string; // e.g. "Years in Development"
  }[];
}

export const AboutInfoSchema = SchemaFactory.createForClass(AboutInfo);
