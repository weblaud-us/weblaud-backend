import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateCareerDto {
  @IsString()
  title: string;

  @IsString()
  position: string;

  @IsString()
  jobDetails: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
