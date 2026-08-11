import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToStringArray } from 'src/common/decorators/multipart.decorators';

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
}
