import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { Invoice } from 'src/modules/invoice/schemas/invoice.schema';
import {
  ClientProject,
  ClientProjectStatus,
} from 'src/modules/client-project/schemas/client-project.schema';
import { Contract } from 'src/modules/contract/schemas/contract.schema';
import { Approval } from 'src/modules/approval/schemas/approval.schema';
import { ChangeRequest } from 'src/modules/change-request/schemas/change-request.schema';
import { UpdateRequest } from 'src/modules/update-request/schemas/update-request.schema';

/**
 * AnalyticsService's actual aggregation *pipelines* (the $lookup/$facet/
 * $bucket stage arrays) can only be verified against a real MongoDB engine
 * — a mocked .aggregate() just returns whatever the test hands it, so it
 * can't catch a malformed pipeline. What it CAN catch, and what these tests
 * cover, is the bug-prone part on this side of the wire: the currency
 * grouping/summing logic (sumByCurrency), the "every status present even
 * with zero projects" default-filling, and that each metric maps aggregate
 * rows into the documented response shape correctly.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let invoiceModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let projectModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let contractModel: { countDocuments: jest.Mock };
  let approvalModel: { countDocuments: jest.Mock };
  let changeRequestModel: { countDocuments: jest.Mock };
  let updateRequestModel: { countDocuments: jest.Mock };

  beforeEach(async () => {
    invoiceModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    projectModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    contractModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    approvalModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    changeRequestModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    updateRequestModel = { countDocuments: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(Invoice.name), useValue: invoiceModel },
        { provide: getModelToken(ClientProject.name), useValue: projectModel },
        { provide: getModelToken(Contract.name), useValue: contractModel },
        { provide: getModelToken(Approval.name), useValue: approvalModel },
        {
          provide: getModelToken(ChangeRequest.name),
          useValue: changeRequestModel,
        },
        {
          provide: getModelToken(UpdateRequest.name),
          useValue: updateRequestModel,
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  it('returns zeroed-out sections rather than throwing when every collection is empty', async () => {
    const result = await service.getOverview();

    expect(result.revenue).toEqual({ thisMonth: [], thisQuarter: [] });
    expect(result.mrr).toEqual([]);
    expect(result.receivables).toEqual({
      outstanding: [],
      overdue: [],
      aging: [],
    });
    expect(result.projects.overBudget).toEqual([]);
    expect(result.projects.overBudgetCount).toBe(0);
    expect(
      Object.values(ClientProjectStatus).every(
        (s) => result.projects.byStatus[s] === 0,
      ),
    ).toBe(true);
  });

  it('keeps revenue grouped by currency rather than summing USD and EUR together', async () => {
    invoiceModel.aggregate.mockResolvedValueOnce([
      {
        thisMonth: [{ _id: 'USD', amount: 5000 }],
        thisQuarter: [
          { _id: 'USD', amount: 12000 },
          { _id: 'EUR', amount: 3000 },
        ],
      },
    ]);

    const result = await service.getOverview();

    expect(result.revenue.thisMonth).toEqual([
      { currency: 'USD', amount: 5000 },
    ]);
    expect(result.revenue.thisQuarter).toEqual(
      expect.arrayContaining([
        { currency: 'USD', amount: 12000 },
        { currency: 'EUR', amount: 3000 },
      ]),
    );
  });

  it('normalizes MRR to a 30-day cycle rather than reporting the raw invoice total', async () => {
    // A $900 retainer billed every 15 days is $1800/mo, not $900 — the
    // aggregate mock here stands in for what the $group/$multiply stage
    // would compute; this test only proves the service maps that number
    // through unchanged (currency-grouped, rounded), not that the pipeline
    // itself does the multiplication (that needs a real Mongo engine).
    invoiceModel.aggregate
      .mockResolvedValueOnce([{ thisMonth: [], thisQuarter: [] }]) // revenue
      .mockResolvedValueOnce([{ _id: 'USD', amount: 1800 }]); // mrr

    const result = await service.getOverview();

    expect(result.mrr).toEqual([{ currency: 'USD', amount: 1800 }]);
  });

  it('derives outstanding/overdue totals from the aging buckets, excluding "current" from overdue', async () => {
    invoiceModel.aggregate
      .mockResolvedValueOnce([{ thisMonth: [], thisQuarter: [] }]) // revenue
      .mockResolvedValueOnce([]) // mrr
      .mockResolvedValueOnce([
        { _id: { currency: 'USD', bucket: 'current' }, amount: 1000, count: 1 },
        { _id: { currency: 'USD', bucket: '0-30' }, amount: 500, count: 1 },
        { _id: { currency: 'USD', bucket: '90+' }, amount: 200, count: 1 },
        { _id: { currency: 'EUR', bucket: '31-60' }, amount: 300, count: 1 },
      ]); // receivables aging

    const result = await service.getOverview();

    expect(result.receivables.aging).toHaveLength(4);
    // outstanding: everything, per currency.
    expect(result.receivables.outstanding).toEqual(
      expect.arrayContaining([
        { currency: 'USD', amount: 1700 },
        { currency: 'EUR', amount: 300 },
      ]),
    );
    // overdue: same, minus the "current" (not-yet-due) bucket.
    expect(result.receivables.overdue).toEqual(
      expect.arrayContaining([
        { currency: 'USD', amount: 700 },
        { currency: 'EUR', amount: 300 },
      ]),
    );
  });

  it('fills every ClientProjectStatus with 0 by default, not just the statuses that have projects', async () => {
    projectModel.aggregate.mockResolvedValueOnce([
      { _id: ClientProjectStatus.ACTIVE, count: 4 },
    ]);

    const result = await service.getOverview();

    expect(result.projects.byStatus[ClientProjectStatus.ACTIVE]).toBe(4);
    expect(result.projects.byStatus[ClientProjectStatus.COMPLETED]).toBe(0);
    expect(result.projects.byStatus[ClientProjectStatus.CANCELLED]).toBe(0);
    expect(Object.keys(result.projects.byStatus).sort()).toEqual(
      Object.values(ClientProjectStatus).sort(),
    );
  });

  it('rounds and maps the profitability aggregate rows into the documented shape (Phase 8)', async () => {
    // computeProjectLaborRollup is rooted at ClientProject (with a $lookup
    // into timeentries), not at TimeEntry directly — see that method's doc
    // comment — so the second projectModel.aggregate call (after
    // computeProjectsByStatus's) is the one to mock here.
    projectModel.aggregate
      .mockResolvedValueOnce([]) // computeProjectsByStatus
      .mockResolvedValueOnce([
        {
          _id: 'proj1',
          name: 'Acme Revamp',
          organizationName: 'Acme Inc',
          budgetAmount: 24000,
          currency: 'USD',
          hoursLogged: 12.3333333,
          laborCost: 1233.3333333,
        },
      ]); // computeProjectLaborRollup

    const result = await service.getOverview();

    expect(result.projects.profitability).toEqual([
      {
        _id: 'proj1',
        name: 'Acme Revamp',
        organizationName: 'Acme Inc',
        budgetAmount: 24000,
        currency: 'USD',
        hoursLogged: 12.33,
        laborCost: 1233.33,
      },
    ]);
  });

  it("reports the action-required queue from each collection's own count", async () => {
    contractModel.countDocuments.mockResolvedValue(2);
    invoiceModel.countDocuments.mockResolvedValue(3);
    approvalModel.countDocuments.mockResolvedValue(1);
    changeRequestModel.countDocuments.mockResolvedValue(5);
    updateRequestModel.countDocuments.mockResolvedValue(7);

    const result = await service.getOverview();

    expect(result.actionRequired).toEqual({
      contractsAwaitingSignature: 2,
      invoicesOverdue: 3,
      pendingApprovals: 1,
      changeRequestsAwaitingQuote: 5,
      changeRequestsAwaitingDecision: 5,
      openUpdateRequests: 7,
    });
  });
});
