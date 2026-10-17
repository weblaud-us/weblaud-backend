import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentProvider {
  STRIPE = 'stripe',
  MANUAL = 'manual',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice', required: true })
  invoice: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ enum: PaymentProvider, required: true })
  provider: PaymentProvider;

  // Stripe Checkout Session id. Unique+sparse: every Stripe payment has one,
  // manual payments never do, and it's the idempotency key the webhook
  // handler matches on to survive Stripe's at-least-once redelivery.
  @Prop({ unique: true, sparse: true })
  providerRef?: string;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // Set once the webhook has fully applied this payment to its invoice (or
  // flagged it for refund). The webhook's idempotency check keys on this,
  // not on status: status flips to SUCCEEDED *before* settlement runs, so
  // keying on it meant a settlement that failed midway was never retried —
  // Stripe's redelivery saw SUCCEEDED and skipped, leaving the invoice unpaid.
  @Prop()
  settledAt?: Date;

  // Money that arrived for an invoice that was already paid or had been
  // voided (e.g. a second checkout tab). Never applied to the invoice — an
  // admin has to refund it in Stripe. See PaymentService.flagForRefund.
  @Prop({ default: false })
  needsRefund: boolean;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ invoice: 1, createdAt: -1 });
