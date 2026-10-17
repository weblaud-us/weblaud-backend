import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUpdateRequestDto {
  @IsNotEmpty()
  @IsString()
  message: string;
}
