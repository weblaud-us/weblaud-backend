import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TrackRecordItem {
  @IsString()
  title: string;

  @IsString()
  subtitle: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  publicationApproved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  evidenceNote?: string;
}

export class UpdateTrackRecordDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackRecordItem)
  trackRecord: TrackRecordItem[];
}
