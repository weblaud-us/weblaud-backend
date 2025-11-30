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
  address: string;  // e.g. "Dhaka Bangladesh"
}

export const ContactInfoSchema = SchemaFactory.createForClass(ContactInfo);
