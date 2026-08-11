import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RateOptionDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  desc: string;

  @IsNumber()
  @Min(0)
  weeks: number;

  @IsNumber()
  @Min(0)
  costMultiplier: number;
}

class TimelineSpeedDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsNumber()
  @Min(0)
  multiplier: number;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsNumber()
  weeksOffset?: number;
}

export class UpdateCalculatorConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rangeSpreadPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  roundToNearest?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateOptionDto)
  projectTypes?: RateOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RateOptionDto)
  features?: RateOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineSpeedDto)
  timelineSpeeds?: TimelineSpeedDto[];
}
