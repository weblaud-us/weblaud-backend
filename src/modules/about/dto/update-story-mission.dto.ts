import { IsOptional, IsString } from 'class-validator';

export class UpdateStoryMissionDto {
  @IsOptional()
  @IsString()
  story?: string;

  @IsOptional()
  @IsString()
  mission?: string;
}
