import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FileVisibility } from '../schemas/project-file.schema';

export class UpdateFileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;
}
