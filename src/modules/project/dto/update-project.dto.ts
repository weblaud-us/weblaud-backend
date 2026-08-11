import { IsArray, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto';
import { ToStringArray } from 'src/common/decorators/multipart.decorators';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  /**
   * The detail image URLs the dashboard is keeping; anything already on the
   * project and absent from this list gets deleted. Keeping exactly one image
   * sends the field once, so it needs the same scalar-to-array coercion as the
   * other repeated fields — and `ProjectService.update` calls `.includes()` on
   * it, which silently does substring matching on a bare string.
   */
  @IsOptional()
  @ToStringArray()
  @IsArray()
  @IsString({ each: true })
  keepDetails?: string[];

  @IsOptional()
  @IsString()
  keepCover?: string;
}
