import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectChangeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
