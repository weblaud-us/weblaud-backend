import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  image?: string; 

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
