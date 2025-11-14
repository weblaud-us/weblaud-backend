import { IsString, IsOptional, IsBoolean } from 'class-validator';

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
}
