// src/modules/about/dto/update-stats.dto.ts
import { IsOptional, IsNumber } from 'class-validator';

export class UpdateStatsDto {
  @IsOptional() @IsNumber() clients?: number;
  @IsOptional() @IsNumber() projects?: number;
  @IsOptional() @IsNumber() successRate?: number;
  @IsOptional() @IsNumber() followers?: number;
  @IsOptional() @IsNumber() experienceYears?: number;
}
