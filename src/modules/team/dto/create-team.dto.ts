import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ToBoolean,
  ToJsonObject,
} from 'src/common/decorators/multipart.decorators';

/**
 * Posted as multipart/form-data — the avatar is a file upload — so `isActive`
 * and `social` need coercing out of their text form. See
 * `src/common/decorators/multipart.decorators.ts`.
 */
export class CreateTeamMemberDto {
  @IsString()
  name: string;

  @IsString()
  title: string;

  @IsOptional()
  avatar?: string;

  @IsOptional()
  @ToJsonObject()
  @IsObject()
  social?: Record<string, string>;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;
}
