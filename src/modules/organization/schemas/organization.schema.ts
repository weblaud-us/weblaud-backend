import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

/** The client's company. Every client User belongs to exactly one of these. */
@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  logo: string;

  @Prop({ required: true, trim: true, lowercase: true })
  billingEmail: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  taxId: string;

  @Prop({ default: 'USD' })
  defaultCurrency: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
