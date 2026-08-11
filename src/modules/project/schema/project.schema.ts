import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectDocument = Project & Document;

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

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
