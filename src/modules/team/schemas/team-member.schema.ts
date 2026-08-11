import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeamMemberDocument = TeamMember & Document;

@Schema({ timestamps: true })
export class TeamMember {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  avatar: string;

  @Prop({
    type: Object,
    default: {
      linkedin: '',
      facebook: '',
      twitter: '',
    },
  })
  social: Record<string, string>;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  order: number;
}

export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);
