import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookingDocument = Booking & Document;

@Schema({ timestamps: true })
export class Booking {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  customerName: string;

  @Prop({ required: true })
  customerEmail: string;

  @Prop({ required: true })
  serviceId: string; // id of the service they booked

  @Prop({ required: true })
  start: Date;

  @Prop({ required: true })
  end: Date;

  @Prop()
  calendarEventId?: string;

  @Prop()
  calendarHtmlLink?: string;

  @Prop()
  meetingLink?: string;

  @Prop({ default: 'pending' })
  status: 'pending' | 'confirmed' | 'cancelled';

  @Prop()
  notes?: string;

  @Prop({ type: Object })
  raw?: any; // raw event object from Google for audit
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
