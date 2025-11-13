import { IsString, IsOptional } from 'class-validator';

export class Step1Dto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  englishProficiency: string;

  @IsOptional()
  avatarUrl?: string; // filled automatically after upload
}
