import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CounterDocument = Counter & Document;

/**
 * One document per named sequence (e.g. "invoice-2026"). `_id` is the
 * sequence key itself rather than a generated ObjectId — CounterService's
 * `findOneAndUpdate` atomically increments `seq` on that key, which is what
 * makes the counter race-free under concurrent callers. See
 * CounterService.next for why this exists: `Model.countDocuments() + 1`
 * (the previous invoice-numbering scheme) both collides after a delete and
 * races under concurrent creates.
 *
 * `_id` must carry an explicit `@Prop({ type: String })` — a bare
 * `_id: string;` field with no decorator is invisible to
 * SchemaFactory.createForClass (it only reads @Prop-decorated members), so
 * the generated schema silently fell back to Mongoose's default ObjectId
 * `_id`. Every call to next() then tried to cast a string key like
 * "invoice-2026" to an ObjectId and threw, which meant no invoice — from
 * any path (direct create, time-entry billing, change-request approval) —
 * could ever actually be numbered.
 */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
