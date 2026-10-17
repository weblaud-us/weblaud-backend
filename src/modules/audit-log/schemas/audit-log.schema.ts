import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

/**
 * Append-only trail for the portal's commercial/scope actions — approvals,
 * payments, scope changes, invites — the events a client dispute or an
 * internal "who approved this" question needs answered. Not a general
 * request logger: only AuditLogService.record() call sites write here, and
 * those are added deliberately as each milestone's write actions land.
 */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false } })
export class AuditLog {
  // Must be Schema.Types.ObjectId, not Types.ObjectId (the value constructor)
  // — see the note on Application.careerId in
  // career/schemas/application.schema.ts. Both fields here are queried
  // directly (findForEntity, the actor lookup) so getting this wrong would
  // make those queries silently match nothing.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  actor: Types.ObjectId;

  /** Short verb phrase, e.g. "invoice.paid", "approval.approved", "user.invited". */
  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  entityType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  meta: Record<string, unknown>;

  @Prop()
  ip?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// The two ways this collection actually gets queried: "history of this one
// entity" (audit tab on a project/invoice/approval) and "everything by this
// actor" (a suspicious-activity lookup on a user).
AuditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
AuditLogSchema.index({ actor: 1, at: -1 });
