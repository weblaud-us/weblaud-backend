import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ApplicationDocument = Application & Document;

@Schema({ timestamps: true })
export class Application {
  // Must be Schema.Types.ObjectId, not Types.ObjectId: this workspace resolves
  // more than one copy of mongoose (upload-pro is linked with its own), so the
  // ObjectId *constructor* imported here isn't the one the schema compiler
  // recognizes — it silently registered the path as Mixed. Nothing then cast
  // query strings to ObjectId, so filtering applications by careerId matched
  // nothing at all.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Career', required: true })
  careerId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  interestReason: string;

  @Prop()
  coverLetter: string;

  @Prop()
  resumeUrl: string;

  @Prop({
    type: String,
    enum: ['new', 'review', 'shortlisted', 'rejected', 'hired'],
    default: 'new',
  })
  status: string;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
