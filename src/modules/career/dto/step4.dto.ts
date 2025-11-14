import { IsOptional, IsString } from 'class-validator';

export class Step4Dto {
  @IsString()
  expectedSalary: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;
}
