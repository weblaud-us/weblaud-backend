import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { FileVisibility } from '../schemas/project-file.schema';

export class UploadFileDto {
  @IsOptional()
  @IsString()
  folder?: string;

  /** Ignored (forced to CLIENT) when the uploader is a client — see FileService.upload. */
  @IsOptional()
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;

  @IsOptional()
  @IsMongoId()
  supersedes?: string;
}
