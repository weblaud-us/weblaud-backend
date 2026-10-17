import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ChangeRequestDocument = ChangeRequest & Document;

export enum ChangeRequestStatus {
  REQUESTED = 'requested',
  QUOTED = 'quoted',
  CLIENT_APPROVED = 'client_approved',
  REJECTED = 'rejected',
  INVOICED = 'invoiced',
}

/**
 * A priced scope addition the client formally approves before extra work
 * starts — the mechanism that keeps "can you also just add X" from becoming
 * free work. Two ways in: a PM raises one already priced (status starts at
 * `quoted` directly — ChangeRequestService.create), or a client_admin asks
 * for scope with no price attached (status starts at `requested` —
 * ChangeRequestService.requestFromClient) and a PM prices it afterward
 * (ChangeRequestService.quote, requested → quoted). Every rule downstream of
 * `quoted` (approve/reject/mark-invoiced) is unchanged either way — the two
 * paths only differ in how a change request arrives at `quoted` in the
 * first place.
 */
@Schema({ timestamps: true })
export class ChangeRequest {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true, min: 0 })
  priceAmount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ enum: ChangeRequestStatus, default: ChangeRequestStatus.QUOTED })
  status: ChangeRequestStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requestedBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectionReason?: string;

  // Set by ChangeRequestService.approve, which auto-generates a draft
  // invoice the moment a client approves — see InvoiceService.
  // createFromChangeRequest. Absent on change requests approved before this
  // existed; those still fall back to the manual markInvoiced flip.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice' })
  invoiceId?: Types.ObjectId;
}

export const ChangeRequestSchema = SchemaFactory.createForClass(ChangeRequest);

ChangeRequestSchema.index({ project: 1, createdAt: -1 });
