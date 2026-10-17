import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ClientProjectStatus,
  MilestoneStatus,
} from '../schemas/client-project.schema';

class BudgetInput {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

class MilestoneInput {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;
}

class TimelineInput {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneInput)
  milestones?: MilestoneInput[];
}

/**
 * `features` and `progress` are deliberately absent — features are their own
 * collection now (see FeatureController's PUT /portal/projects/:id/features,
 * only reachable once the project exists) and progress is derived by
 * TaskService from the task board, not hand-entered at creation. See the
 * schema comment on ClientProject.progress.
 */
export class CreateClientProjectDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ClientProjectStatus)
  status?: ClientProjectStatus;

  @IsMongoId()
  organization: string;

  @IsMongoId()
  projectManager: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  team?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetInput)
  budget?: BudgetInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimelineInput)
  timeline?: TimelineInput;

  @IsOptional()
  @IsString()
  coverImage?: string;
}
