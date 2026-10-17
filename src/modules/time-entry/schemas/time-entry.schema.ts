import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TimeEntryDocument = TimeEntry & Document;

/**
 * Phase 8 — depends on Task (Phase 6) for `task`, and on User.costRate/
 * billRate (staff-only/select:false — see the comment there) for the
 * profitability math in AnalyticsService and the billing bridge in
 * TimeEntryService.generateInvoice, respectively. Never exposed to clients:
 * TimeEntryController rejects Role.USER outright, the same blunt gate
 * InvoiceController/ContractController use for money-adjacent surfaces,
 * on top of the finer per-row scoping in TimeEntryService (a team member
 * sees only their own entries; PM/admin see the whole project's).
 */
@Schema({ timestamps: true })
export class TimeEntry {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Task' })
  task?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, min: 1 })
  minutes: number;

  @Prop({ default: '' })
  note: string;

  @Prop({ default: true })
  billable: boolean;

  // Set together by TimeEntryService.generateInvoice — once true this row
  // is locked (see assertEditable): the whole point of marking it billed is
  // that the number on a sent invoice can't silently drift from the record
  // it was computed from.
  @Prop({ default: false })
  invoiced: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Invoice' })
  invoiceId?: Types.ObjectId;
}

export const TimeEntrySchema = SchemaFactory.createForClass(TimeEntry);

TimeEntrySchema.index({ project: 1, user: 1, date: -1 });
