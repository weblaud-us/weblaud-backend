import { Model } from 'mongoose';
import { LeadFollowUpService } from './lead-follow-up.service';
import {
  DashboardAlertInput,
  DashboardNotifierService,
} from '../mail/dashboard-notifier.service';
import { ContactDocument } from '../contact/schemas/contact.schema';
import { EstimateDocument } from '../estimates/schemas/estimate.schema';
import { AuditDocument } from '../audits/schemas/audit.schema';

const NOW = new Date('2026-10-13T08:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** find().sort().lean() chain resolving to `rows`. */
const findReturning = (rows: object[]) =>
  jest.fn().mockReturnValue({
    sort: () => ({ lean: () => Promise.resolve(rows) }),
  });

type DueFilter = {
  status?: unknown;
  stage?: unknown;
  $or: { createdAt?: { $gte: Date } }[];
};

describe('LeadFollowUpService', () => {
  let contactModel: { find: jest.Mock };
  let estimateModel: { find: jest.Mock };
  let auditModel: { find: jest.Mock };
  let notifier: {
    notifyNew: jest.Mock<Promise<void>, [DashboardAlertInput]>;
    adminUrl: jest.Mock;
  };

  const build = () =>
    new LeadFollowUpService(
      contactModel as unknown as Model<ContactDocument>,
      estimateModel as unknown as Model<EstimateDocument>,
      auditModel as unknown as Model<AuditDocument>,
      notifier as unknown as DashboardNotifierService,
    );

  beforeEach(() => {
    contactModel = { find: findReturning([]) };
    estimateModel = { find: findReturning([]) };
    auditModel = { find: findReturning([]) };
    notifier = {
      notifyNew: jest
        .fn<Promise<void>, [DashboardAlertInput]>()
        .mockResolvedValue(undefined),
      adminUrl: jest.fn((p: string) => `https://weblaud.com/cpadmin${p}`),
    };
  });

  it('sends nothing when no lead is due', async () => {
    await expect(build().sendFollowUpDigest(NOW)).resolves.toBe(0);
    expect(notifier.notifyNew).not.toHaveBeenCalled();
  });

  it('lists due follow-ups and unanswered new leads in one email', async () => {
    contactModel.find = findReturning([
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: daysAgo(5),
        nextFollowUpAt: daysAgo(1),
      },
    ]);
    estimateModel.find = findReturning([
      { name: 'Grace', email: 'grace@example.com', createdAt: daysAgo(2) },
    ]);

    await expect(build().sendFollowUpDigest(NOW)).resolves.toBe(2);

    const [alert] = notifier.notifyNew.mock.calls[0];
    expect(alert.heading).toBe('2 leads need a follow-up');
    expect(alert.rows).toEqual([
      {
        section: 'Contact messages',
        label: 'Ada Lovelace',
        value: 'Follow-up due 2026-10-12 · ada@example.com',
        href: 'https://weblaud.com/cpadmin/contact-submissions',
      },
      {
        section: 'Estimates',
        label: 'Grace',
        value: 'Still "new" after 2 days · grace@example.com',
        href: 'https://weblaud.com/cpadmin/estimate-submissions',
      },
    ]);
  });

  it('excludes spam, closed deals, and pre-pipeline history from the query', async () => {
    await build().sendFollowUpDigest(NOW);

    const [filter] = contactModel.find.mock.calls[0] as [DueFilter];
    expect(filter.status).toEqual({ $ne: 'spam' });
    expect(filter.stage).toEqual({ $nin: ['won', 'lost'] });
    // The "unanswered" branch only looks back two weeks, so leads from
    // before the pipeline existed don't all land in the first digest.
    expect(filter.$or[1].createdAt?.$gte).toEqual(daysAgo(14));
  });
});
