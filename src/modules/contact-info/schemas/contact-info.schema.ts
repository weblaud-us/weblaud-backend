import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactInfoDocument = ContactInfo & Document;

@Schema({ timestamps: true })
export class ContactInfo {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  addressLine1: string; // e.g. "Dhaka Bangladesh"

  @Prop()
  addressLine2?: string; // e.g. "Post code: 1207"

  @Prop()
  city?: string; // e.g. "Dhaka"
}

export const ContactInfoSchema = SchemaFactory.createForClass(ContactInfo);
