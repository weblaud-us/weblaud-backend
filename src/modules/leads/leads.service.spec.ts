import { Model } from 'mongoose';
import { LeadsService } from './leads.service';
import { ContactDocument } from '../contact/schemas/contact.schema';
import { EstimateDocument } from '../estimates/schemas/estimate.schema';
import { AuditDocument } from '../audits/schemas/audit.schema';

type Counted = { _id: string | null; count: number };
type Pipeline = [
  { $match: Record<string, unknown> },
  { $group: { _id: { $ifNull: [string, string] } } },
];

/**
 * A model whose aggregate() answers by the field being grouped on, so the
 * test reads as data rather than as call-order bookkeeping.
 */
function fakeModel(
  byField: Record<string, Counted[]>,
  due: number,
  unclaimedAudits = 0,
) {
  return {
    aggregate: jest.fn((pipeline: Pipeline) => {
      const field = pipeline[1].$group._id.$ifNull[0].slice(1);
      return { exec: () => Promise.resolve(byField[field] ?? []) };
    }),
    // The unclaimed-audit count is the only query asking for `email` to be absent.
    countDocuments: jest.fn(
      (filter: { email?: { $exists?: boolean }; status?: unknown }) => ({
        exec: () =>
          Promise.resolve(
            filter.email?.$exists === false ? unclaimedAudits : due,
          ),
      }),
    ),
  };
}

describe('LeadsService.summary', () => {
  it('combines both sources per stage, counting pre-pipeline leads as new', async () => {
    const contacts = fakeModel(
      {
        stage: [
          { _id: 'new', count: 3 },
          { _id: 'won', count: 1 },
        ],
        heardAbout: [
          { _id: 'ai_assistant', count: 2 },
          { _id: 'unknown', count: 2 },
        ],
        'attribution.utmSource': [{ _id: 'linkedin', count: 1 }],
      },
      2,
    );
    const estimates = fakeModel(
      {
        stage: [
          { _id: 'new', count: 1 },
          { _id: 'proposal_sent', count: 2 },
        ],
        heardAbout: [{ _id: 'ai_assistant', count: 1 }],
        'attribution.utmSource': [
          { _id: 'linkedin', count: 2 },
          { _id: 'newsletter', count: 1 },
        ],
      },
      1,
    );
    const audits = fakeModel(
      {
        stage: [{ _id: 'call_booked', count: 1 }],
        heardAbout: [{ _id: 'google', count: 1 }],
      },
      1,
      5,
    );

    const service = new LeadsService(
      contacts as unknown as Model<ContactDocument>,
      estimates as unknown as Model<EstimateDocument>,
      audits as unknown as Model<AuditDocument>,
    );
    const summary = await service.summary(new Date('2026-10-13T00:00:00Z'));

    expect(summary.stages).toEqual({
      new: 4,
      contacted: 0,
      call_booked: 1,
      proposal_sent: 2,
      won: 1,
      lost: 0,
    });
    expect(summary.followUpsDue).toBe(4);
    expect(summary.sources.heardAbout).toEqual({
      ai_assistant: 3,
      unknown: 2,
      google: 1,
    });
    expect(summary.sources.total).toBe(6);
    expect(summary.sources.auditsRunUnclaimed).toBe(5);
    expect(summary.sources.utmSources).toEqual([
      { source: 'linkedin', count: 3 },
      { source: 'newsletter', count: 1 },
    ]);
  });

  it('leaves spam messages and anonymous audit runs out of every lead count', async () => {
    const contacts = fakeModel({}, 0);
    const estimates = fakeModel({}, 0);
    const audits = fakeModel({}, 0);
    const service = new LeadsService(
      contacts as unknown as Model<ContactDocument>,
      estimates as unknown as Model<EstimateDocument>,
      audits as unknown as Model<AuditDocument>,
    );

    await service.summary();

    for (const call of contacts.aggregate.mock.calls) {
      expect(call[0][0].$match.status).toEqual({ $ne: 'spam' });
    }
    for (const call of audits.aggregate.mock.calls) {
      expect(call[0][0].$match.email).toEqual({ $exists: true });
    }
    expect(contacts.countDocuments.mock.calls[0][0].status).toEqual({
      $ne: 'spam',
    });
  });
});
