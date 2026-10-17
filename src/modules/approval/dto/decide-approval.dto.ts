import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
