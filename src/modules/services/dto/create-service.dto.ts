import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ToStringArray } from 'src/common/decorators/multipart.decorators';

/**
 * Posted as multipart/form-data — the card image is a file upload — so
 * `features` arrives as a repeated text field. See
 * `src/common/decorators/multipart.decorators.ts`.
 */
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
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
