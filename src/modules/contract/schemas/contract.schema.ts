import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ContractDocument = Contract & Document;

export enum ContractStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  VOID = 'void',
}

/**
 * Immutable once set — accepting a contract is a legal event, not an edit.
 * `signatureImage` is a data URL (drawn on a canvas client-side) rather than
 * an uploaded file: it's small, never needs to be served standalone, and
 * embedding it straight into the acceptance-certificate PDF (see
 * ContractService.generateCertificate) needs exactly this shape.
 */
@Schema({ _id: false })
export class ContractAcceptance {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  signatureImage?: string;

  @Prop({ required: true })
  acceptedAt: Date;

  @Prop({ required: true })
  ip: string;

  @Prop({ required: true })
  userAgent: string;
}
export const ContractAcceptanceSchema =
  SchemaFactory.createForClass(ContractAcceptance);

@Schema({ timestamps: true })
export class Contract {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  })
  organization: Types.ObjectId;

  // Optional — a master services agreement can predate any specific project.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ClientProject' })
  project?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  // The uploaded SOW/contract PDF the client reads before accepting.
  @Prop()
  documentUrl?: string;

  @Prop({ default: 1 })
  version: number;

  @Prop({ enum: ContractStatus, default: ContractStatus.DRAFT })
  status: ContractStatus;

  @Prop({ type: ContractAcceptanceSchema })
  acceptance?: ContractAcceptance;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

ContractSchema.index({ organization: 1, createdAt: -1 });
