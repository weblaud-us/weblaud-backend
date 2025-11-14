import { IsBoolean, IsOptional, IsString, IsArray } from 'class-validator';

export class UpdateAboutInfoDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  story?: string;

  @IsOptional()
  @IsString()
  mission?: string;

  @IsOptional()
  stats?: Record<string, number>;

  @IsOptional()
  @IsArray()
  trackRecord?: {
    title: string;
    subtitle: string;
  }[];
}
