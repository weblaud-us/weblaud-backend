import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ToStringArray } from 'src/common/decorators/multipart.decorators';
import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from '../schema/project.schema';

/**
 * Posted as multipart/form-data — cover and detail images are file uploads —
 * so the list fields arrive as repeated text fields and need coercing. See
 * `src/common/decorators/multipart.decorators.ts`.
 */
export class CreateProjectDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  featureList?: string[];

  @IsOptional()
  @IsString()
  coverImageAlt?: string;

  @IsOptional()
  @IsString()
  problem?: string;

  @IsOptional()
  @IsString()
  solution?: string;

  @IsOptional()
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  techStack?: string[];

  @IsOptional()
  @IsString()
  businessImpact?: string;

  @IsOptional()
  @IsIn(PUBLICATION_STATUSES)
  publicationStatus?: PublicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  evidenceNotes?: string;
}
