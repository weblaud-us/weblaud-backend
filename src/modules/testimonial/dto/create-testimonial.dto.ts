import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateTestimonialDto {
  @IsString()
  quote: string;

  @IsString()
  authorName: string;

  @IsString()
  authorTitle: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
