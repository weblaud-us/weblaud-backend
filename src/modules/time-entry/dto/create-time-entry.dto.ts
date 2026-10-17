import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateTimeEntryDto {
  @IsOptional()
  @IsMongoId()
  task?: string;

  @IsDateString()
  date: string;

  @IsInt()
  @IsPositive()
  minutes: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;
}
