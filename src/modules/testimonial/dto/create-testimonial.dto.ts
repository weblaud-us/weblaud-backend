import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateTestimonialDto {
  @IsString()
  quote: string;

  @IsString()
  authorName: string;

  @IsOptional()
  @IsString()
  authorTitle?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
