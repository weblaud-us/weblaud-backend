import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateContactInfoDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  address: string;
}
