import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class Step3Dto {
  @IsBoolean() hasExperience: boolean;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  companyLocation?: string;

  @IsOptional()
  @IsString()
  joiningDate?: string;

  @IsOptional()
  @IsString()
  exitDate?: string;

  @IsOptional()
  @IsString()
  lastSalary?: string;

  @IsOptional()
  @IsString()
  totalExperienceYears?: string;
}
