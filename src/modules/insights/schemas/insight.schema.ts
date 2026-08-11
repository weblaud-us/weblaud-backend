import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InsightDocument = Insight & Document;

export enum InsightCategory {
  ENGINEERING = 'Engineering',
  ARCHITECTURE = 'Architecture',
  AI_ML = 'AI & ML',
  OPERATIONS = 'Operations',
}

class InsightAuthor {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  role: string;

  @Prop()
  avatarUrl: string;
}

class InsightContentSection {
  @Prop({ required: true })
  heading: string;

  @Prop({ required: true })
  text: string;
}

@Schema({ timestamps: true })
export class Insight {
  @Prop({ required: true, unique: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ required: true, enum: InsightCategory })
  category: InsightCategory;

  @Prop({ required: true })
  readTime: string;

  @Prop({ required: true, type: Date })
  publishedAt: Date;

  @Prop({ type: InsightAuthor, required: true })
  author: InsightAuthor;

  @Prop({ required: true })
  directAnswer: string;

  @Prop({ type: [String], default: [] })
  keyTakeaways: string[];

  @Prop({ type: [InsightContentSection], default: [] })
  content: InsightContentSection[];

  @Prop({ default: true })
  isActive: boolean;
}

export const InsightSchema = SchemaFactory.createForClass(Insight);
