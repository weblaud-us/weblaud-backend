import { IsString } from 'class-validator';

export class Step2Dto {
  @IsString()
  educationLevel: string;

  @IsString()
  subject: string;

  @IsString()
  institute: string;

  @IsString()
  gpa: string;

  @IsString()
  passingYear: string;
}
