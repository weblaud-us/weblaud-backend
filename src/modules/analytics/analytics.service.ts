import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from 'src/modules/invoice/schemas/invoice.schema';
import {
  ClientProject,
  ClientProjectDocument,
  ClientProjectStatus,
} from 'src/modules/client-project/schemas/client-project.schema';
import {
  Contract,
  ContractDocument,
  ContractStatus,
} from 'src/modules/contract/schemas/contract.schema';
import {
  Approval,
  ApprovalDocument,
  ApprovalStatus,
} from 'src/modules/approval/schemas/approval.schema';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeRequestStatus,
} from 'src/modules/change-request/schemas/change-request.schema';
import {
  UpdateRequest,
  UpdateRequestDocument,
  UpdateRequestStatus,
} from 'src/modules/update-request/schemas/update-request.schema';

/** A currency-scoped sum — every money rollup here is grouped by currency rather than collapsed into one number, since there's no FX conversion anywhere in the system and adding USD to EUR as if equal would just be a wrong number with more confidence behind it. */
export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export interface AgingBucket {
  bucket: 'current' | '0-30' | '31-60' | '61-90' | '90+';
  currency: string;
  amount: number;
  count: number;
}

/**
 * "Over budget" means labor burn (Σ hours × costRate) past budgetAmount —
 * not budgetSpent, which is Σ paid invoices and measures what's been
 * collected, not what's been spent delivering. budgetSpent is still
 * carried here as extra context, not as the basis for the comparison.
 * Same currency caveat as ProjectProfitability below — laborCost isn't
 * currency-tagged, so this reads as "cost in whatever currency your rates
 * are set in" rather than a strict same-currency comparison.
 */
export interface OverBudgetProject {
  _id: string;
  name: string;
  organizationName: string;
  budgetAmount: number;
  budgetSpent: number;
  currency: string;
  hoursLogged: number;
  laborCost: number;
}

/**
 * `laborCost` has no currency of its own — User.costRate isn't
 * currency-tagged (see its schema comment), so this is presented next to
 * `budgetAmount`/`currency` rather than blended into one "margin" figure,
 * the same no-silent-FX-conversion stance as everywhere else in this file.
 * An agency billing multiple currencies should read this as "cost in
 * whatever currency your rates are set in", not as directly netted against
 * budgetAmount unless that happens to be the same currency.
 */
export interface ProjectProfitability {
  _id: string;
  name: string;
  organizationName: string;
  budgetAmount: number;
  currency: string;
  hoursLogged: number;
  laborCost: number;
}

export interface AnalyticsOverview {
  revenue: {
    thisMonth: CurrencyAmount[];
    thisQuarter: CurrencyAmount[];
  };
  /** Monthly recurring revenue, normalized to a 30-day month — see computeMrr. */
  mrr: CurrencyAmount[];
  receivables: {
    outstanding: CurrencyAmount[];
    overdue: CurrencyAmount[];
    aging: AgingBucket[];
  };
  projects: {
    byStatus: Record<string, number>;
    overBudget: OverBudgetProject[];
    overBudgetCount: number;
    /** Top 20 worst-margin projects with any logged time, worst first — projects with no logged time at all are simply absent, not zero-padded. */
    profitability: ProjectProfitability[];
  };
  actionRequired: {
    contractsAwaitingSignature: number;
    invoicesOverdue: number;
    pendingApprovals: number;
    /** Client-requested scope with no PM pricing yet — see ChangeRequestStatus.REQUESTED. Distinct from changeRequestsAwaitingDecision (already quoted, waiting on the client). */
    changeRequestsAwaitingQuote: number;
    changeRequestsAwaitingDecision: number;
    openUpdateRequests: number;
  };
  generatedAt: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Invoice.name)
    private readonly invoices: Model<InvoiceDocument>,
    @InjectModel(ClientProject.name)
    private readonly projects: Model<ClientProjectDocument>,
    @InjectModel(Contract.name)
    private readonly contracts: Model<ContractDocument>,
    @InjectModel(Approval.name)
    private readonly approvals: Model<ApprovalDocument>,
    @InjectModel(ChangeRequest.name)
    private readonly changeRequests: Model<ChangeRequestDocument>,
    @InjectModel(UpdateRequest.name)
    private readonly updateRequests: Model<UpdateRequestDocument>,
  ) {}

  /**
   * The one screen an agency owner should see on login: what's been earned,
   * what's still owed and how overdue it is, which projects are burning
   * past budget, and what's sitting in someone else's queue waiting on a
   * decision. Everything here is a genuine MongoDB aggregation over the
   * whole collection — no per-project fan-out — so this stays cheap as the
   * portal grows.
   *
   * Deliberately absent: a lead→won-project conversion rate. Contact and
   * estimate submissions have no field linking them to the ClientProject
   * they became (see the audit's "leads dead-end" finding) — computing a
   * win rate would mean fabricating that link, not measuring it.
   */
  async getOverview(): Promise<AnalyticsOverview> {
    const now = new Date();

    const [
      revenue,
      mrr,
      receivables,
      projectsByStatus,
      laborRollup,
      actionRequired,
    ] = await Promise.all([
      this.computeRevenue(now),
      this.computeMrr(),
      this.computeReceivables(now),
      this.computeProjectsByStatus(),
      this.computeProjectLaborRollup(),
      this.computeActionRequired(),
    ]);

    // Both derived from the one rollup rather than two separate
    // aggregations — over-budget and profitability are two different views
    // of the same underlying number (labor burn vs. budget), not two
    // different computations.
    const overBudgetAll = laborRollup
      .filter((p) => p.laborCost > p.budgetAmount)
      .sort(
        (a, b) => b.laborCost - b.budgetAmount - (a.laborCost - a.budgetAmount),
      );
    // Capped at 10 — this feeds an "action required" list, not a report;
    // overBudgetCount alongside it carries the full total.
    const overBudget = overBudgetAll.slice(0, 10);
    const overBudgetCount = overBudgetAll.length;

    const profitability = laborRollup
      .filter((p) => p.hoursLogged > 0)
      .sort(
        (a, b) => a.budgetAmount - a.laborCost - (b.budgetAmount - b.laborCost),
      )
      .slice(0, 20);

    return {
      revenue,
      mrr,
      receivables,
      projects: {
        byStatus: projectsByStatus,
        overBudget,
        overBudgetCount,
        profitability,
      },
      actionRequired,
      generatedAt: now.toISOString(),
    };
  }

  private async computeRevenue(
    now: Date,
  ): Promise<{ thisMonth: CurrencyAmount[]; thisQuarter: CurrencyAmount[] }> {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3,
      1,
    );

    const [result] = await this.invoices.aggregate<{
      thisMonth: { _id: string; amount: number }[];
      thisQuarter: { _id: string; amount: number }[];
    }>([
      {
        $match: {
          status: InvoiceStatus.PAID,
          paidAt: { $gte: startOfQuarter },
        },
      },
      {
        $facet: {
          thisMonth: [
            { $match: { paidAt: { $gte: startOfMonth } } },
            { $group: { _id: '$currency', amount: { $sum: '$total' } } },
          ],
          thisQuarter: [
            { $group: { _id: '$currency', amount: { $sum: '$total' } } },
          ],
        },
      },
    ]);

    return {
      thisMonth: (result?.thisMonth ?? []).map((r) => ({
        currency: r._id,
        amount: r.amount,
      })),
      thisQuarter: (result?.thisQuarter ?? []).map((r) => ({
        currency: r._id,
        amount: r.amount,
      })),
    };
  }

  /**
   * Sum of every active retainer template's total, normalized to a 30-day
   * cycle — a template billing 900 every 15 days is 1800 MRR, not 900. Only
   * templates count (recurring:true with no recurringSourceId — see the
   * schema comment on Invoice.recurringSourceId): a generated clone is a
   * one-off invoice, not a second subscription.
   */
  private async computeMrr(): Promise<CurrencyAmount[]> {
    const rows = await this.invoices.aggregate<{ _id: string; amount: number }>(
      [
        {
          $match: {
            recurring: true,
            recurringSourceId: { $exists: false },
            status: { $ne: InvoiceStatus.VOID },
            recurrenceIntervalDays: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: '$currency',
            amount: {
              $sum: {
                $multiply: [
                  '$total',
                  { $divide: [30, '$recurrenceIntervalDays'] },
                ],
              },
            },
          },
        },
      ],
    );

    return rows.map((r) => ({
      currency: r._id,
      amount: Math.round(r.amount * 100) / 100,
    }));
  }

  /**
   * Outstanding balance (total minus succeeded payments) on every
   * sent/overdue/partially-paid invoice, bucketed by how far past due it
   * is. The $lookup against `payments` is what makes a PARTIALLY_PAID
   * invoice's outstanding figure correct instead of double-counting the
   * part that's already been paid — see InvoiceService.settleFromLedger for
   * the same Σ-payments logic on the write side.
   */
  private async computeReceivables(now: Date): Promise<{
    outstanding: CurrencyAmount[];
    overdue: CurrencyAmount[];
    aging: AgingBucket[];
  }> {
    const rows = await this.invoices.aggregate<{
      _id: { currency: string; bucket: AgingBucket['bucket'] };
      amount: number;
      count: number;
    }>([
      {
        $match: {
          status: {
            $in: [
              InvoiceStatus.SENT,
              InvoiceStatus.OVERDUE,
              InvoiceStatus.PARTIALLY_PAID,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'payments',
          let: { invoiceId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$invoice', '$$invoiceId'] },
                    { $eq: ['$status', 'succeeded'] },
                  ],
                },
              },
            },
            { $group: { _id: null, paid: { $sum: '$amount' } } },
          ],
          as: 'ledger',
        },
      },
      {
        $addFields: {
          outstanding: {
            $subtract: [
              '$total',
              { $ifNull: [{ $arrayElemAt: ['$ledger.paid', 0] }, 0] },
            ],
          },
          daysPastDue: {
            $divide: [{ $subtract: [now, '$dueDate'] }, MS_PER_DAY],
          },
        },
      },
      // A partial payment can fully cover the total (rounding, or a payment
      // recorded slightly over) — nothing left owed, so it's not AR.
      { $match: { outstanding: { $gt: 0 } } },
      {
        $addFields: {
          bucket: {
            $switch: {
              branches: [
                { case: { $lt: ['$daysPastDue', 0] }, then: 'current' },
                { case: { $lt: ['$daysPastDue', 31] }, then: '0-30' },
                { case: { $lt: ['$daysPastDue', 61] }, then: '31-60' },
                { case: { $lt: ['$daysPastDue', 91] }, then: '61-90' },
              ],
              default: '90+',
            },
          },
        },
      },
      {
        $group: {
          _id: { currency: '$currency', bucket: '$bucket' },
          amount: { $sum: '$outstanding' },
          count: { $sum: 1 },
        },
      },
    ]);

    const aging = rows.map((r) => ({
      bucket: r._id.bucket,
      currency: r._id.currency,
      amount: Math.round(r.amount * 100) / 100,
      count: r.count,
    }));

    const outstanding = sumByCurrency(aging);
    const overdue = sumByCurrency(aging.filter((r) => r.bucket !== 'current'));

    return { outstanding, overdue, aging };
  }

  private async computeProjectsByStatus(): Promise<Record<string, number>> {
    const rows = await this.projects.aggregate<{
      _id: ClientProjectStatus;
      count: number;
    }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

    const byStatus: Record<string, number> = {};
    for (const status of Object.values(ClientProjectStatus))
      byStatus[status] = 0;
    for (const row of rows) byStatus[row._id] = row.count;
    return byStatus;
  }

  /**
   * Every project's labor burn — hours logged and their cost (Σ hours ×
   * each contributor's costRate) — computed once and shared by both the
   * over-budget and profitability views in getOverview(). Rooted at
   * ClientProject via a $lookup into `timeentries`, not at TimeEntry
   * directly: a project with zero logged hours still comes back (hoursLogged/
   * laborCost at 0) instead of silently vanishing from the over-budget
   * check — a fixed-bid project that's never had time logged against it is
   * exactly the kind of project this check should still be able to flag as
   * newly over budget once it is. The inner $group is by (project, user)
   * before summing, same reasoning as the profitability calc always had:
   * each contributor's hours have to multiply by *their* rate before
   * summing, or the result averages rates across the team instead of
   * costing each person's time correctly.
   */
  private async computeProjectLaborRollup(): Promise<
    (OverBudgetProject &
      Pick<ProjectProfitability, 'hoursLogged' | 'laborCost'>)[]
  > {
    const rows = await this.projects.aggregate<{
      _id: unknown;
      name: string;
      organizationName?: string;
      budgetAmount: number;
      budgetSpent: number;
      currency: string;
      hoursLogged: number;
      laborCost: number;
    }>([
      {
        $lookup: {
          from: 'timeentries',
          let: { projectId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$project', '$$projectId'] } } },
            { $group: { _id: '$user', minutes: { $sum: '$minutes' } } },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'contributor',
              },
            },
            { $unwind: '$contributor' },
            {
              $group: {
                _id: null,
                hoursLogged: { $sum: { $divide: ['$minutes', 60] } },
                laborCost: {
                  $sum: {
                    $multiply: [
                      { $divide: ['$minutes', 60] },
                      { $ifNull: ['$contributor.costRate', 0] },
                    ],
                  },
                },
              },
            },
          ],
          as: 'labor',
        },
      },
      {
        $addFields: {
          hoursLogged: {
            $ifNull: [{ $arrayElemAt: ['$labor.hoursLogged', 0] }, 0],
          },
          laborCost: {
            $ifNull: [{ $arrayElemAt: ['$labor.laborCost', 0] }, 0],
          },
        },
      },
      {
        $lookup: {
          from: 'organizations',
          localField: 'organization',
          foreignField: '_id',
          as: 'org',
        },
      },
      {
        $project: {
          name: 1,
          organizationName: { $arrayElemAt: ['$org.name', 0] },
          budgetAmount: '$budget.amount',
          budgetSpent: '$budget.spent',
          currency: '$budget.currency',
          hoursLogged: 1,
          laborCost: 1,
        },
      },
    ]);

    return rows.map((r) => ({
      _id: String(r._id),
      name: r.name,
      organizationName: r.organizationName ?? '',
      budgetAmount: r.budgetAmount,
      budgetSpent: r.budgetSpent,
      currency: r.currency,
      hoursLogged: Math.round(r.hoursLogged * 100) / 100,
      laborCost: Math.round(r.laborCost * 100) / 100,
    }));
  }

  private async computeActionRequired(): Promise<
    AnalyticsOverview['actionRequired']
  > {
    const [
      contractsAwaitingSignature,
      invoicesOverdue,
      pendingApprovals,
      changeRequestsAwaitingQuote,
      changeRequestsAwaitingDecision,
      openUpdateRequests,
    ] = await Promise.all([
      this.contracts.countDocuments({ status: ContractStatus.SENT }),
      this.invoices.countDocuments({ status: InvoiceStatus.OVERDUE }),
      this.approvals.countDocuments({ status: ApprovalStatus.PENDING }),
      this.changeRequests.countDocuments({
        status: ChangeRequestStatus.REQUESTED,
      }),
      this.changeRequests.countDocuments({
        status: ChangeRequestStatus.QUOTED,
      }),
      this.updateRequests.countDocuments({ status: UpdateRequestStatus.OPEN }),
    ]);

    return {
      contractsAwaitingSignature,
      invoicesOverdue,
      pendingApprovals,
      changeRequestsAwaitingQuote,
      changeRequestsAwaitingDecision,
      openUpdateRequests,
    };
  }
}

function sumByCurrency(
  rows: { currency: string; amount: number }[],
): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({
    currency,
    amount: Math.round(amount * 100) / 100,
  }));
}
