import { UpdateLeadPipelineDto } from './dto/update-lead-pipeline.dto';

const CLEARABLE_FIELDS = ['internalNotes', 'lostReason'] as const;

/**
 * Turns a pipeline PATCH into a Mongo update. Fields left out of the DTO are
 * untouched; fields sent as null/"" are $unset rather than stored empty, so
 * "has a follow-up date" stays a simple existence check.
 */
export function buildPipelineUpdate(dto: UpdateLeadPipelineDto) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (dto.stage !== undefined) $set.stage = dto.stage;

  for (const field of CLEARABLE_FIELDS) {
    const value = dto[field];
    if (value === undefined) continue;
    const trimmed = value?.trim();
    if (trimmed) $set[field] = trimmed;
    else $unset[field] = 1;
  }

  if (dto.nextFollowUpAt !== undefined) {
    if (dto.nextFollowUpAt) $set.nextFollowUpAt = new Date(dto.nextFollowUpAt);
    else $unset.nextFollowUpAt = 1;
  }

  // A deal that's no longer lost shouldn't keep explaining why it was.
  if (dto.stage && dto.stage !== 'lost' && dto.lostReason === undefined) {
    $unset.lostReason = 1;
  }

  return {
    ...(Object.keys($set).length ? { $set } : {}),
    ...(Object.keys($unset).length ? { $unset } : {}),
  };
}
