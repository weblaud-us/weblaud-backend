import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaskStatus } from '../schemas/task.schema';

class TaskPosition {
  @IsMongoId()
  id: string;

  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsInt()
  @Min(0)
  order: number;
}

/**
 * One call covers a whole drag-and-drop move: the dragged card's new
 * column+position, plus every other card in the source and destination
 * columns whose `order` shifted to make room — the frontend computes the
 * full resulting position list client-side and sends it in one shot rather
 * than the backend trying to infer neighbors from a single (id, index) pair.
 */
export class ReorderTasksDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TaskPosition)
  positions: TaskPosition[];
}
