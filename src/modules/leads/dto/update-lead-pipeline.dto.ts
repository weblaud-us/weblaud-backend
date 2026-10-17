import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LEAD_STAGES, type LeadStage } from '../lead.constants';

/**
 * Admin-side pipeline edit. Every field is optional so the panel can PATCH
 * just what changed. `null` or "" clears a field (e.g. removing a follow-up
 * date once it's handled).
 */
export class UpdateLeadPipelineDto {
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lostReason?: string | null;
}
