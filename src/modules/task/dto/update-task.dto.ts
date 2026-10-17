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
  ValidateIf,
} from 'class-validator';
import { TaskStatus } from '../schemas/task.schema';

/**
 * Not PartialType(CreateTaskDto) — feature/assignee/dueDate need a third
 * state beyond "provide a value" / "omit the key" (which a plain optional
 * field can't express): explicit `null` to actually clear a field that was
 * previously set, e.g. unassigning a task. Omitting the key still means
 * "leave it alone", same as everywhere else in this codebase.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @ValidateIf((o) => o.feature !== null)
  @IsMongoId()
  feature?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.assignee !== null)
  @IsMongoId()
  assignee?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.dueDate !== null)
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimateHours?: number;

  @IsOptional()
  @IsBoolean()
  clientVisible?: boolean;
}
