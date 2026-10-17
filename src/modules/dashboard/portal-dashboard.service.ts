import { Injectable } from '@nestjs/common';
import { ContractService } from 'src/modules/contract/contract.service';
import { ApprovalService } from 'src/modules/approval/approval.service';
import { InvoiceService } from 'src/modules/invoice/invoice.service';
import { ChangeRequestService } from 'src/modules/change-request/change-request.service';
import { UpdateRequestService } from 'src/modules/update-request/update-request.service';
import { ProjectUpdateService } from 'src/modules/project-update/project-update.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { ContractStatus } from 'src/modules/contract/schemas/contract.schema';
import { ApprovalStatus } from 'src/modules/approval/schemas/approval.schema';
import { InvoiceStatus } from 'src/modules/invoice/schemas/invoice.schema';
import { ChangeRequestStatus } from 'src/modules/change-request/schemas/change-request.schema';
import { UpdateRequestStatus } from 'src/modules/update-request/schemas/update-request.schema';
import { Role } from 'src/common/enum/user.role.enum';
import {
  assertProjectAccess,
  isProjectManager,
} from 'src/common/utils/project-access.util';
import {
  PortalProjectSection,
  portalProjectLink,
  projectIdFromLink,
} from 'src/common/utils/portal-links.util';

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
  changeRequestsAwaitingDecision: AttentionGroup;
  unpaidInvoices: AttentionGroup;
  overdueInvoices: AttentionGroup;
  unreadMentions: AttentionGroup;
  /** Staff only (admin, or the project's PM) — absent for clients. */
  changeRequestsAwaitingQuote?: AttentionGroup;
  openUpdateRequests?: AttentionGroup;
  updatesPendingReview?: AttentionGroup;
  /** Sum of every group's count — the portal sidebar badge. */
  total: number;
}

/** Badge counts per top-level project tab (see the site's projects.$id.tsx). */
export interface ProjectAttentionCounts {
  decisions: number;
  billing: number;
  updates: number;
  work: number;
  files: number;
  total: number;
}

export interface ProjectAttention {
  counts: ProjectAttentionCounts;
  summary: PortalAttentionSummary;
}

/**
 * The raw, already access-scoped rows a summary is built from. Lists may
 * hold any status — buildSummary does the status filtering, so the same
 * function serves the cross-project dashboard and a single project.
 * Rows are lean documents whose `project` is either populated
 * ({ _id, name }) or a bare id.
 */
export interface AttentionSources {
  contracts: any[];
  approvals: any[];
  invoices: any[];
  changeRequests: any[];
  mentions: any[];
  /** null = the actor isn't staff for these rows; staff groups are omitted. */
  staff: { updateRequests: any[]; pendingUpdates: any[] } | null;
}

/** Cap on how many rows each group returns — the count is always exact, the list is a preview. */
const PREVIEW_LIMIT = 5;

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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

function group<T>(
  rows: T[],
  toItem: (row: T) => AttentionItem,
): AttentionGroup {
  return {
    count: rows.length,
    items: rows.slice(0, PREVIEW_LIMIT).map(toItem),
  };
}

function projectIdOf(row: { project?: any }): string | undefined {
  const p = row.project;
  if (!p) return undefined;
  return typeof p === 'object' && '_id' in p ? String(p._id) : String(p);
}

function linkFor(
  row: { project?: any },
  section: PortalProjectSection,
): string | undefined {
  const id = projectIdOf(row);
  return id ? portalProjectLink(id, section) : undefined;
}

function onProject(row: { project?: any }, fallback: string): string {
  const name = typeof row.project === 'object' ? row.project?.name : undefined;
  return name ? `On ${name}` : fallback;
}

function owed(invoice: { total?: number; amountPaid?: number }): number {
  return Math.max(0, (invoice.total ?? 0) - (invoice.amountPaid ?? 0));
}

/** Pure — exported for the spec. */
export function buildSummary(src: AttentionSources): PortalAttentionSummary {
  const awaitingContracts = src.contracts.filter(
    (c) => c.status === ContractStatus.SENT,
  );
  const pendingApprovals = src.approvals.filter(
    (a) => a.status === ApprovalStatus.PENDING,
  );
  const quoted = src.changeRequests.filter(
    (c) => c.status === ChangeRequestStatus.QUOTED,
  );
  // OVERDUE is its own group; "unpaid" is everything still owed that isn't
  // late yet, so an invoice never shows up twice.
  const unpaid = src.invoices.filter(
    (i) =>
      i.status === InvoiceStatus.SENT ||
      i.status === InvoiceStatus.PARTIALLY_PAID,
  );
  const overdue = src.invoices.filter(
    (i) => i.status === InvoiceStatus.OVERDUE,
  );

  const summary: PortalAttentionSummary = {
    contractsAwaitingSignature: group(awaitingContracts, (c) => ({
      _id: String(c._id),
      title: c.title,
      meta: 'Awaiting signature',
      link: linkFor(c, 'contract'),
    })),
    pendingApprovals: group(pendingApprovals, (a) => ({
      _id: String(a._id),
      title: a.title,
      meta: onProject(a, 'Awaiting a decision'),
      link: linkFor(a, 'approvals'),
    })),
    changeRequestsAwaitingDecision: group(quoted, (c) => ({
      _id: String(c._id),
      title: c.title,
      meta: `Quoted at ${money(c.priceAmount ?? 0, c.currency ?? 'USD')}`,
      link: linkFor(c, 'changes'),
    })),
    unpaidInvoices: group(unpaid, (i) => ({
      _id: String(i._id),
      title: `Invoice ${i.number}`,
      meta: `${money(owed(i), i.currency)} due ${dateFmt.format(new Date(i.dueDate))}`,
      link: linkFor(i, 'invoices'),
    })),
    overdueInvoices: group(overdue, (i) => ({
      _id: String(i._id),
      title: `Invoice ${i.number}`,
      meta: `${money(owed(i), i.currency)} overdue`,
      link: linkFor(i, 'invoices'),
    })),
    // _id is the notification's own, so the site can mark it read on click.
    unreadMentions: group(src.mentions, (n) => ({
      _id: String(n._id),
      title: n.body ? `“${n.body}”` : n.title,
      meta: 'You were mentioned',
      link: n.link,
    })),
    total: 0,
  };

  if (src.staff) {
    const requested = src.changeRequests.filter(
      (c) => c.status === ChangeRequestStatus.REQUESTED,
    );
    const openQuestions = src.staff.updateRequests.filter(
      (r) => r.status === UpdateRequestStatus.OPEN,
    );
    summary.changeRequestsAwaitingQuote = group(requested, (c) => ({
      _id: String(c._id),
      title: c.title,
      meta: onProject(c, 'Needs a price'),
      link: linkFor(c, 'changes'),
    }));
    summary.openUpdateRequests = group(openQuestions, (r) => ({
      _id: String(r._id),
      title: String(r.message ?? '').slice(0, 80) || 'Status question',
      meta: onProject(r, 'Waiting for a reply'),
      link: linkFor(r, 'questions'),
    }));
    summary.updatesPendingReview = group(src.staff.pendingUpdates, (u) => ({
      _id: String(u._id),
      title: u.title,
      meta: onProject(u, 'Waiting for review'),
      link: linkFor(u, 'updates'),
    }));
  }

  summary.total = Object.entries(summary).reduce(
    (sum, [key, value]) =>
      key === 'total' ? sum : sum + ((value as AttentionGroup)?.count ?? 0),
    0,
  );
  return summary;
}

/** Which project tab a mention belongs on, from its stored notification link. */
function mentionTab(
  link: string | undefined,
): 'work' | 'files' | 'updates' {
  if (link && /\/tasks(?:[/?#]|$)/.test(link)) return 'work';
  if (link && /\/files(?:[/?#]|$)/.test(link)) return 'files';
  return 'updates';
}

/** Pure — exported for the spec. Keys match the portal's top-level project tabs. */
export function countsByTab(
  summary: PortalAttentionSummary,
  mentions: { link?: string }[],
): ProjectAttentionCounts {
  const counts: ProjectAttentionCounts = {
    decisions:
      summary.pendingApprovals.count +
      summary.changeRequestsAwaitingDecision.count +
      (summary.changeRequestsAwaitingQuote?.count ?? 0) +
      (summary.openUpdateRequests?.count ?? 0),
    billing:
      summary.contractsAwaitingSignature.count +
      summary.unpaidInvoices.count +
      summary.overdueInvoices.count,
    updates: summary.updatesPendingReview?.count ?? 0,
    work: 0,
    files: 0,
    total: summary.total,
  };
  for (const m of mentions) counts[mentionTab(m.link)] += 1;
  return counts;
}

/**
 * The portal-side equivalent of AnalyticsService's admin `actionRequired`
 * counts, scoped to what one user can see (their org's projects, or the
 * projects they're staff on) rather than the whole agency. Every list comes
 * from a sibling service's existing access-checked finder; this only
 * filters and shapes, so there is no new access-control surface here.
 *
 * Staff-only groups (requests to price, questions to answer, updates to
 * review) are the PM's job, so they only cover projects the actor manages
 * — every project, for an admin.
 */
@Injectable()
export class PortalDashboardService {
  constructor(
    private readonly contracts: ContractService,
    private readonly approvals: ApprovalService,
    private readonly invoices: InvoiceService,
    private readonly changeRequests: ChangeRequestService,
    private readonly updateRequests: UpdateRequestService,
    private readonly projectUpdates: ProjectUpdateService,
    private readonly notifications: NotificationService,
    private readonly projects: ClientProjectService,
  ) {}

  private isStaff(actor: any): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.MANAGER;
  }

  private async mentionsFor(actor: any) {
    if (!actor._id) return [];
    return this.notifications.findUnreadByType(
      actor._id.toString(),
      'comment_mention',
    );
  }

  /**
   * `actor` is req.user, untyped here same as every controller in this
   * codebase — it's forwarded to sibling services that each declare their
   * own slightly different Actor shape.
   */
  async attentionSummary(actor: any): Promise<PortalAttentionSummary> {
    const staff = this.isStaff(actor);
    const [contracts, approvals, invoices, changeRequests, mentions] =
      await Promise.all([
        this.contracts.findForPortalUser(actor),
        this.approvals.findForPortalUser(actor),
        this.invoices.findForPortalUser(actor),
        this.changeRequests.findForPortalUser(
          actor,
          staff
            ? [ChangeRequestStatus.QUOTED, ChangeRequestStatus.REQUESTED]
            : [ChangeRequestStatus.QUOTED],
        ),
        this.mentionsFor(actor),
      ]);

    let staffSources: AttentionSources['staff'] = null;
    let scopedChangeRequests = changeRequests;
    if (staff) {
      // undefined = every project (admin).
      const managed =
        actor.role === Role.ADMIN
          ? undefined
          : await this.projects.findProjectIdsManagedBy(actor._id.toString());
      const [updateRequests, pendingUpdates] = await Promise.all([
        this.updateRequests.findOpenForProjects(managed),
        this.projectUpdates.reviewQueue(actor),
      ]);
      staffSources = { updateRequests, pendingUpdates };
      // Pricing a request is the PM's job — a team member doesn't see it.
      scopedChangeRequests = changeRequests.filter(
        (c) =>
          c.status !== ChangeRequestStatus.REQUESTED ||
          !managed ||
          managed.includes(projectIdOf(c) ?? ''),
      );
    }

    return buildSummary({
      contracts,
      approvals,
      invoices,
      changeRequests: scopedChangeRequests,
      mentions,
      staff: staffSources,
    });
  }

  /**
   * One project's inbox — the Overview's "Needs your input" list and the
   * tab badges. Access is checked up front, and each per-project finder
   * below re-checks it. Also used by the weekly digest with a synthesized
   * client actor (no _id, so no mentions).
   */
  async projectAttention(
    projectId: string,
    actor: any,
  ): Promise<ProjectAttention> {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);

    const pm = this.isStaff(actor) && isProjectManager(subject, actor);
    const [contracts, approvals, invoices, changeRequests, allMentions] =
      await Promise.all([
        this.contracts.findForProject(projectId, actor),
        this.approvals.findForProject(projectId, actor),
        this.invoices.findForProject(projectId, actor),
        this.changeRequests.findForProject(projectId, actor),
        this.mentionsFor(actor),
      ]);
    const mentions = allMentions.filter(
      (n) => projectIdFromLink(n.link) === projectId,
    );

    let staffSources: AttentionSources['staff'] = null;
    if (pm) {
      const [updateRequests, queue] = await Promise.all([
        this.updateRequests.findForProject(projectId, actor),
        this.projectUpdates.reviewQueue(actor),
      ]);
      staffSources = {
        updateRequests,
        pendingUpdates: queue.filter((u) => projectIdOf(u) === projectId),
      };
    }

    const summary = buildSummary({
      contracts,
      approvals,
      invoices,
      changeRequests: pm
        ? changeRequests
        : changeRequests.filter(
            (c) => c.status !== ChangeRequestStatus.REQUESTED,
          ),
      mentions,
      staff: staffSources,
    });
    return { counts: countsByTab(summary, mentions), summary };
  }
}
