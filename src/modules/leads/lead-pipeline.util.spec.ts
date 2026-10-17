import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { buildPipelineUpdate } from './lead-pipeline.util';
import { UpdateLeadPipelineDto } from './dto/update-lead-pipeline.dto';
import { stageFilter } from './lead.constants';

describe('buildPipelineUpdate', () => {
  it('leaves fields that were not sent untouched', () => {
    expect(
      buildPipelineUpdate({ internalNotes: 'Called, left voicemail' }),
    ).toEqual({ $set: { internalNotes: 'Called, left voicemail' } });
  });

  it('unsets fields sent as null or blank instead of storing them empty', () => {
    expect(
      buildPipelineUpdate({ internalNotes: '   ', nextFollowUpAt: null }),
    ).toEqual({ $unset: { internalNotes: 1, nextFollowUpAt: 1 } });
  });

  it('stores the follow-up date as a Date', () => {
    const update = buildPipelineUpdate({
      nextFollowUpAt: '2026-10-20T00:00:00.000Z',
    });
    expect(update.$set?.nextFollowUpAt).toEqual(
      new Date('2026-10-20T00:00:00.000Z'),
    );
  });

  it('keeps the lost reason when marking a lead lost', () => {
    expect(
      buildPipelineUpdate({ stage: 'lost', lostReason: 'Went with in-house' }),
    ).toEqual({ $set: { stage: 'lost', lostReason: 'Went with in-house' } });
  });

  it('drops a stale lost reason when a lead is reopened', () => {
    expect(buildPipelineUpdate({ stage: 'contacted' })).toEqual({
      $set: { stage: 'contacted' },
      $unset: { lostReason: 1 },
    });
  });
});

describe('stageFilter', () => {
  it('counts pre-pipeline records with no stage as new', () => {
    expect(stageFilter('new')).toEqual({ stage: { $in: ['new', null] } });
  });

  it('matches other stages exactly', () => {
    expect(stageFilter('won')).toEqual({ stage: 'won' });
  });
});

describe('UpdateLeadPipelineDto', () => {
  const errorsFor = (body: object) =>
    validate(plainToInstance(UpdateLeadPipelineDto, body));

  it('accepts a known stage and an ISO date', async () => {
    await expect(
      errorsFor({ stage: 'call_booked', nextFollowUpAt: '2026-10-20' }),
    ).resolves.toHaveLength(0);
  });

  it('accepts null to clear a field', async () => {
    await expect(
      errorsFor({ nextFollowUpAt: null, lostReason: null }),
    ).resolves.toHaveLength(0);
  });

  it('rejects an unknown stage', async () => {
    const errors = await errorsFor({ stage: 'maybe' });
    expect(errors.map((e) => e.property)).toEqual(['stage']);
  });

  it('rejects a malformed date', async () => {
    const errors = await errorsFor({ nextFollowUpAt: 'next tuesday' });
    expect(errors.map((e) => e.property)).toEqual(['nextFollowUpAt']);
  });
});
