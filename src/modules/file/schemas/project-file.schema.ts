import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProjectFileDocument = ProjectFile & Document;

export enum FileVisibility {
  INTERNAL = 'internal',
  CLIENT = 'client',
}

/**
 * Phase 7. `visibility` only ever gates what a CLIENT sees — staff always
 * see every file on a project regardless of this value (see
 * FileService.findForProject). Defaults to INTERNAL: a staff-uploaded file
 * is hidden from the client until someone deliberately marks it visible,
 * the same conservative-default reasoning as Task.clientVisible's opposite
 * default (true) — a task board is internal coordination shown outward by
 * exception, a file is a real asset shown outward by intent.
 */
@Schema({ timestamps: true })
export class ProjectFile {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ClientProject',
    required: true,
  })
  project: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  // Whatever UploadService.upload() returned (S3 URL, Cloudinary URL, or a
  // local path) — never sent to a portal caller directly. See the comment on
  // Contract.documentUrl / ContractService.stripDocumentUrl: this is the
  // same fix (stream through an authenticated endpoint), applied from day
  // one here instead of retrofitted after the fact.
  @Prop({ required: true })
  storageKey: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ enum: FileVisibility, default: FileVisibility.INTERNAL })
  visibility: FileVisibility;

  @Prop({ default: 1 })
  version: number;

  /** Set when this upload replaces an earlier one — points at the file it supersedes, forming a version chain. Neither row is deleted; the UI just badges version > 1. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ProjectFile' })
  supersedes?: Types.ObjectId;

  /** A flat label for lightweight grouping ("Contracts", "Design", ...) — not a real folder hierarchy. */
  @Prop()
  folder?: string;
}

export const ProjectFileSchema = SchemaFactory.createForClass(ProjectFile);

ProjectFileSchema.index({ project: 1, createdAt: -1 });
