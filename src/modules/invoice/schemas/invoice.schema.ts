import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

export enum InvoiceType {
  ONE_OFF = 'one_off',
  DEPOSIT = 'deposit',
  MILESTONE = 'milestone',
  RETAINER = 'retainer',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  OVERDUE = 'overdue',
  VOID = 'void',
}

@Schema({ _id: false })
export class InvoiceLineItem {
  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  qty: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;
}
export const InvoiceLineItemSchema =
  SchemaFactory.createForClass(InvoiceLineItem);

@Schema({ timestamps: true })
export class Invoice {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  })
  organization: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  // Assigned once at creation (InvoiceService.create) — never regenerated on
  // edit, so a draft that's revised repeatedly keeps the same number a
  // client may have already seen quoted to them.
  @Prop({ required: true, unique: true })
  number: string;

  @Prop({ enum: InvoiceType, default: InvoiceType.ONE_OFF })
  type: InvoiceType;

  @Prop({ type: [InvoiceLineItemSchema], default: [] })
  lineItems: InvoiceLineItem[];

  // subtotal/total are server-computed from lineItems + tax on every
  // create/update (InvoiceService.computeTotals) — never trusted from the
  // request body, so a client can't submit a mismatched total.
  @Prop({ required: true, default: 0 })
  subtotal: number;

  @Prop({ default: 0 })
  tax: number;

  @Prop({ required: true, default: 0 })
  total: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Prop({ required: true })
  issueDate: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop()
  paidAt?: Date;

  // Bounds InvoiceService.sendOverdueReminders: an invoice overdue for
  // months shouldn't re-notify its client daily forever. lastReminderAt is
  // informational (surfaced on the invoice), reminderCount is what the job
  // actually gates on.
  @Prop({ default: 0 })
  reminderCount: number;

  @Prop()
  lastReminderAt?: Date;

  @Prop({ default: '' })
  notes: string;

  // --- Retainer recurrence (only meaningful when type === RETAINER) ---

  /** Marks this invoice as the template a scheduled job clones from — see InvoiceService.generateDueRetainers. */
  @Prop({ default: false })
  recurring: boolean;

  @Prop()
  recurrenceIntervalDays?: number;

  /** Set only on a generated clone, pointing back at its template. Templates never have this set — that distinction is what stops the job from cloning a clone. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice' })
  recurringSourceId?: Types.ObjectId;

  /** Set only on the template, each time the job clones it — drives "is the next one due yet". */
  @Prop()
  lastGeneratedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ organization: 1, createdAt: -1 });
InvoiceSchema.index({ project: 1, createdAt: -1 });
