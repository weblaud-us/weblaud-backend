import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Contact, ContactDocument } from '../contact/schemas/contact.schema';
import {
  Estimate,
  EstimateDocument,
} from '../estimates/schemas/estimate.schema';
import { Audit, AuditDocument } from '../audits/schemas/audit.schema';
import { followUpDueFilter, LEAD_STAGES, LeadStage } from './lead.constants';

/** How far back the "where leads come from" breakdown looks. */
const SOURCE_WINDOW_DAYS = 90;
const TOP_UTM_SOURCES = 5;

export interface LeadsSummary {
  /** Contact messages (spam excluded) + estimates + claimed audits, per stage. */
  stages: Record<LeadStage, number>;
  /** Same definition as the daily follow-up digest. */
  followUpsDue: number;
  sources: {
    windowDays: number;
    total: number;
    /** Self-reported answers; `unknown` = question skipped or pre-dates it. */
    heardAbout: Record<string, number>;
    utmSources: { source: string; count: number }[];
    /** Website audits run in the window whose report nobody claimed. */
    auditsRunUnclaimed: number;
  };
}

type Counted = { _id: string | null; count: number };

/** Read-side rollups across both lead sources for the admin dashboard. */
@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Contact.name)
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Estimate.name)
    private readonly estimateModel: Model<EstimateDocument>,
    @InjectModel(Audit.name)
    private readonly auditModel: Model<AuditDocument>,
  ) {}

  async summary(now = new Date()): Promise<LeadsSummary> {
    const since = new Date(now.getTime() - SOURCE_WINDOW_DAYS * 86_400_000);
    const contactMatch = { status: { $ne: 'spam' } };

    const groupBy = (
      field: string,
      fallback: string,
      extraMatch: object = {},
    ): PipelineStage[] => [
      { $match: extraMatch },
      {
        $group: {
          _id: { $ifNull: [`$${field}`, fallback] },
          count: { $sum: 1 },
        },
      },
    ];
    const recent = { createdAt: { $gte: since } };
    const withUtm = {
      ...recent,
      'attribution.utmSource': { $exists: true, $nin: [null, ''] },
    };

    // One query per (rollup × source); the collections stay small, and
    // keeping them separate leaves each source's own filter in one place.
    // Audits only count once claimed — an anonymous run isn't a lead.
    const all = <T>(run: (model: Model<any>, match: object) => Promise<T>) =>
      Promise.all([
        run(this.contactModel, contactMatch),
        run(this.estimateModel, {}),
        run(this.auditModel, { email: { $exists: true } }),
      ]);

    const [stageRows, heardRows, utmRows, dueCounts, auditsRunUnclaimed] =
      await Promise.all([
        all((m, match) =>
          m.aggregate<Counted>(groupBy('stage', 'new', match)).exec(),
        ),
        all((m, match) =>
          m
            .aggregate<Counted>(
              groupBy('heardAbout', 'unknown', { ...match, ...recent }),
            )
            .exec(),
        ),
        all((m, match) =>
          m
            .aggregate<Counted>(
              groupBy('attribution.utmSource', 'unknown', {
                ...match,
                ...withUtm,
              }),
            )
            .exec(),
        ),
        all((m, match) =>
          m.countDocuments({ ...match, ...followUpDueFilter(now) }).exec(),
        ),
        this.auditModel
          .countDocuments({ ...recent, email: { $exists: false } })
          .exec(),
      ]);

    const stages = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0])) as Record<
      LeadStage,
      number
    >;
    for (const row of stageRows.flat()) {
      const stage = (row._id ?? 'new') as LeadStage;
      if (stage in stages) stages[stage] += row.count;
    }

    const heardAbout = sumById(heardRows.flat());
    const utmSources = Object.entries(sumById(utmRows.flat()))
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_UTM_SOURCES);

    return {
      stages,
      followUpsDue: dueCounts.reduce((a, b) => a + b, 0),
      sources: {
        windowDays: SOURCE_WINDOW_DAYS,
        total: Object.values(heardAbout).reduce((a, b) => a + b, 0),
        heardAbout,
        utmSources,
        auditsRunUnclaimed,
      },
    };
  }
}

function sumById(rows: Counted[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = row._id ?? 'unknown';
    out[key] = (out[key] ?? 0) + row.count;
  }
  return out;
}
