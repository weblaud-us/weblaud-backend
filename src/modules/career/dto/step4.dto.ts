import { IsString } from 'class-validator';

export class Step4Dto {
  @IsString()
  expectedSalary: string;

  @IsString()
  resumeUrl: string; // auto-set after file upload
}
