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
    description?: string; // optional longer copy shown under the subtitle
    /**
     * Public only once someone has checked the figure against evidence.
     * Entries saved before this existed have no value and stay hidden.
     */
    publicationApproved?: boolean;
    /** Internal: the source of the figure and who approved it. Never public. */
    evidenceNote?: string;
  }[];
}

export const AboutInfoSchema = SchemaFactory.createForClass(AboutInfo);
