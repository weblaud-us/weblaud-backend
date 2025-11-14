import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TrackRecordItem {
  @IsString()
  title: string;

  @IsString()
  subtitle: string;
}

export class UpdateTrackRecordDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackRecordItem)
  trackRecord: TrackRecordItem[];
}
