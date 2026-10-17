import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateContractDto {
  @IsNotEmpty()
  @IsMongoId()
  organization: string;

  @IsOptional()
  @IsMongoId()
  project?: string;

  @IsNotEmpty()
  @IsString()
  title: string;
}
