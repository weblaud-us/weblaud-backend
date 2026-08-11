import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTeamMemberDto {
  @IsString()
  name: string;

  @IsString()
  title: string;

  @IsOptional()
  avatar?: string;

  @IsOptional()
  social?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;
}
