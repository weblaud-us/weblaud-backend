import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UpdateRequestDocument = UpdateRequest & Document;

export enum UpdateRequestStatus {
  OPEN = 'open',
  ANSWERED = 'answered',
  CLOSED = 'closed',
}

/** A client asking "what's the status?" — notifies the PM, and stays visible until answered/closed. See UpdateRequestService. */
@Schema({ timestamps: true })
export class UpdateRequest {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requestedBy: Types.ObjectId;

  @Prop({ required: true })
  message: string;

  @Prop({ enum: UpdateRequestStatus, default: UpdateRequestStatus.OPEN })
  status: UpdateRequestStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  answeredBy?: Types.ObjectId;

  @Prop()
  answeredAt?: Date;

  /** The PM's reply — required to reach ANSWERED (see UpdateRequestService.close). Never set when the requester closes their own question instead. */
  @Prop()
  response?: string;
}

export const UpdateRequestSchema = SchemaFactory.createForClass(UpdateRequest);

UpdateRequestSchema.index({ project: 1, status: 1, createdAt: -1 });
