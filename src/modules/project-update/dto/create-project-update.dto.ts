import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProjectUpdateType } from '../schemas/project-update.schema';

export class CreateProjectUpdateDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(ProjectUpdateType)
  type?: ProjectUpdateType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressValue?: number;
}
