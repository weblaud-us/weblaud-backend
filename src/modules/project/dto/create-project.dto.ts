import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @IsArray()
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
  @IsArray()
  @IsString({ each: true })
  techStack?: string[];

  @IsOptional()
  @IsString()
  businessImpact?: string;
}
