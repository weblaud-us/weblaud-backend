import { IsString } from 'class-validator';

export class StartApplicationDto {
  @IsString()
  careerId: string;
}
