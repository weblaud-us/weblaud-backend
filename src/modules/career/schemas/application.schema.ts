import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ApplicationDocument = Application & Document;

@Schema({ _id: true })
export class ApplicantEmail {
  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  message: string;

  @Prop()
  taskUrl?: string;

  @Prop()
  dueAt?: Date;

  @Prop({ required: true, default: () => new Date() })
  sentAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  sentBy?: Types.ObjectId;
}

export const ApplicantEmailSchema = SchemaFactory.createForClass(ApplicantEmail);

@Schema({ timestamps: true })
export class Application {
  // Must be Schema.Types.ObjectId, not Types.ObjectId. The latter is the value
  // constructor; only the former is a schema *type* the compiler recognizes.
  // Passing the constructor silently registered the path as Mixed, so nothing
  // cast query strings to ObjectId and filtering applications by careerId
  // matched nothing at all. Fails quietly at query time, not at boot.
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

  // Original upload's name and MIME type. Needed because the stored URL can't
  // be trusted for either: upload-pro strips the extension from Cloudinary
  // `raw` assets. Absent on applications from before these were recorded —
  // CareerService.getResumeFile sniffs the type from the bytes for those.
  @Prop()
  resumeFileName?: string;

  @Prop()
  resumeMimeType?: string;

  @Prop({
    type: String,
    enum: ['new', 'review', 'shortlisted', 'rejected', 'hired'],
    default: 'new',
  })
  status: string;

  // Every email sent to the applicant from the admin (task, interview invite,
  // rejection...), oldest first — the detail page lists them so nobody sends
  // the same assignment twice.
  @Prop({ type: [ApplicantEmailSchema], default: [] })
  emails: ApplicantEmail[];
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
