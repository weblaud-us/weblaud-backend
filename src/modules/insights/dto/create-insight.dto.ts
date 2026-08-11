import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InsightCategory } from '../schemas/insight.schema';

class InsightAuthorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

class InsightContentSectionDto {
  @IsString()
  @IsNotEmpty()
  heading: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}

export class CreateInsightDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  summary: string;

  @IsEnum(InsightCategory)
  category: InsightCategory;

  @IsString()
  @IsNotEmpty()
  readTime: string;

  @IsDateString()
  publishedAt: string;

  @ValidateNested()
  @Type(() => InsightAuthorDto)
  author: InsightAuthorDto;

  @IsString()
  @IsNotEmpty()
  directAnswer: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyTakeaways?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InsightContentSectionDto)
  content?: InsightContentSectionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
