import { Injectable } from '@nestjs/common';
import { ContractService } from 'src/modules/contract/contract.service';
import { ApprovalService } from 'src/modules/approval/approval.service';
import { InvoiceService } from 'src/modules/invoice/invoice.service';
import { ContractStatus } from 'src/modules/contract/schemas/contract.schema';
import { ApprovalStatus } from 'src/modules/approval/schemas/approval.schema';
import { InvoiceStatus } from 'src/modules/invoice/schemas/invoice.schema';

export interface AttentionItem {
  _id: string;
  title: string;
  meta: string;
  link?: string;
}

export interface AttentionGroup {
  count: number;
  items: AttentionItem[];
}

export interface PortalAttentionSummary {
  contractsAwaitingSignature: AttentionGroup;
  pendingApprovals: AttentionGroup;
  overdueInvoices: AttentionGroup;
}

/** Cap on how many rows each group returns — the count is always exact, the list is just a preview for the dashboard card. */
const PREVIEW_LIMIT = 5;

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/**
 * The portal-side equivalent of AnalyticsService's admin `actionRequired`
 * counts, but scoped to what one user can see (their org's projects, or the
 * projects they're staff on) rather than the whole agency. Reuses each
 * domain service's existing findForPortalUser — already access-checked and
 * role-scoped — and just filters/shapes the result, so there is no
 * additional access-control surface here to get wrong.
 */
@Injectable()
export class PortalDashboardService {
  constructor(
    private readonly contracts: ContractService,
    private readonly approvals: ApprovalService,
    private readonly invoices: InvoiceService,
  ) {}

  /**
   * `actor` is req.user, untyped here same as every controller in this
   * codebase — it's forwarded to three sibling services that each declare
   * their own slightly different local Actor/PortalActor shape (see
   * ContractService, ApprovalService, InvoiceService), so there's no single
   * interface that satisfies all three without a cast at each call site.
   */
  async attentionSummary(actor: any): Promise<PortalAttentionSummary> {
    const [contracts, approvals, invoices] = await Promise.all([
      this.contracts.findForPortalUser(actor),
      this.approvals.findForPortalUser(actor),
      this.invoices.findForPortalUser(actor),
    ]);

    const awaitingContracts = contracts.filter(
      (c) => c.status === ContractStatus.SENT,
    );
    const pendingApprovals = approvals.filter(
      (a) => a.status === ApprovalStatus.PENDING,
    );
    const overdueInvoices = invoices.filter(
      (i) => i.status === InvoiceStatus.OVERDUE,
    );

    return {
      contractsAwaitingSignature: {
        count: awaitingContracts.length,
        items: awaitingContracts.slice(0, PREVIEW_LIMIT).map((c) => {
          const project = c.project as unknown as
            | { _id: string; name: string }
            | undefined;
          return {
            _id: String(c._id),
            title: c.title,
            meta: 'Awaiting signature',
            link: project
              ? `/portal/projects/${project._id}/contract`
              : undefined,
          };
        }),
      },
      pendingApprovals: {
        count: pendingApprovals.length,
        items: pendingApprovals.slice(0, PREVIEW_LIMIT).map((a) => {
          const project = a.project as unknown as
            | { _id: string; name: string }
            | undefined;
          return {
            _id: String(a._id),
            title: a.title,
            meta: project?.name
              ? `On ${project.name}`
              : 'Awaiting your decision',
            link: project
              ? `/portal/projects/${project._id}/approvals`
              : undefined,
          };
        }),
      },
      overdueInvoices: {
        count: overdueInvoices.length,
        items: overdueInvoices.slice(0, PREVIEW_LIMIT).map((i) => {
          const project = i.project as unknown as
            | { _id: string; name: string }
            | undefined;
          return {
            _id: String(i._id),
            title: `Invoice ${i.number}`,
            meta: money(i.total, i.currency),
            link: project
              ? `/portal/projects/${project._id}/invoices`
              : undefined,
          };
        }),
      },
    };
  }
}
