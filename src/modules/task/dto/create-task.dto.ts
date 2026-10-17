import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { TaskStatus } from '../schemas/task.schema';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsMongoId()
  feature?: string;

  @IsOptional()
  @IsMongoId()
  assignee?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimateHours?: number;

  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}
