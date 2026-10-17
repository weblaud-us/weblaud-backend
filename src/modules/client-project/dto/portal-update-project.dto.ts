import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  ClientProjectStatus,
  MilestoneStatus,
} from '../schemas/client-project.schema';

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
 * What a project's PM (or an admin) may edit from inside the portal —
 * deliberately a subset of UpdateClientProjectDto. `organization`,
 * `projectManager`, and `budget` are absent on purpose: reassigning who's
 * billed, who's accountable, and how much money is on the line stays an
 * agency-side (/cpadmin) decision, not something a PM can change from their
 * own workspace. See client-project.service.ts#updateForPortalUser.
 *
 * `features` and `progress` are also absent — features are edited via
 * FeatureController (PUT /portal/projects/:id/features) and progress is
 * derived by TaskService from the task board, not settable directly. See
 * the schema comment on ClientProject.progress.
 */
export class PortalUpdateProjectDto {
  @IsOptional()
  @IsEnum(ClientProjectStatus)
  status?: ClientProjectStatus;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  team?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TimelineInput)
  timeline?: TimelineInput;
}
