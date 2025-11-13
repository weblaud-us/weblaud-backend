import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicationDocument = Application & Document;

@Schema({ timestamps: true })
export class Application {
  @Prop({ type: Types.ObjectId, ref: 'Career', required: true })
  careerId: Types.ObjectId;

  // Track current step (1-4)
  @Prop({ default: 1 })
  currentStep: number;

  // STEP 1: Personal Info + Photo

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop()
  englishProficiency?: string;

  @Prop()
  avatarUrl?: string; // applicant photo

  // STEP 2: Education

  @Prop()
  educationLevel?: string;

  @Prop()
  subject?: string;

  @Prop()
  institute?: string;

  @Prop()
  gpa?: string;

  @Prop()
  passingYear?: string;

  // STEP 3: Work Experience

  @Prop({ default: false })
  hasExperience?: boolean;

  @Prop()
  companyName?: string;

  @Prop()
  jobTitle?: string;

  @Prop()
  department?: string;

  @Prop()
  companyLocation?: string;

  @Prop()
  joiningDate?: string;

  @Prop()
  exitDate?: string;

  @Prop()
  lastSalary?: string;

  @Prop()
  totalExperienceYears?: string;

  // STEP 4: Final Step
  @Prop()
  expectedSalary?: string;

  @Prop()
  resumeUrl?: string;

  @Prop({ default: false })
  submitted: boolean;

  @Prop({
    type: String,
    enum: ['new', 'review', 'shortlisted', 'rejected', 'hired'],
    default: 'new',
  })
  status: string;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
