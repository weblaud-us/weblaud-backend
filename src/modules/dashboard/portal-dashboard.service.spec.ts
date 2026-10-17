import { ForbiddenException } from '@nestjs/common';

// Every sibling service is replaced with a dummy class before the real
// ones load — several transitively import the User schema, which
// SchemaFactory can't build under ts-jest's isolated per-file compilation
// (see invoice.service.spec.ts). All behaviour comes from the mocks below.
jest.mock('src/modules/contract/contract.service', () => ({
  ContractService: class ContractService {},
}));
jest.mock('src/modules/approval/approval.service', () => ({
  ApprovalService: class ApprovalService {},
}));
jest.mock('src/modules/invoice/invoice.service', () => ({
  InvoiceService: class InvoiceService {},
}));
jest.mock('src/modules/change-request/change-request.service', () => ({
  ChangeRequestService: class ChangeRequestService {},
}));
jest.mock('src/modules/update-request/update-request.service', () => ({
  UpdateRequestService: class UpdateRequestService {},
}));
jest.mock('src/modules/project-update/project-update.service', () => ({
  ProjectUpdateService: class ProjectUpdateService {},
}));
jest.mock('src/modules/notification/notification.service', () => ({
  NotificationService: class NotificationService {},
}));
jest.mock('src/modules/client-project/client-project.service', () => ({
  ClientProjectService: class ClientProjectService {},
}));

import {
  PortalDashboardService,
  buildSummary,
  countsByTab,
} from './portal-dashboard.service';
import { Role } from 'src/common/enum/user.role.enum';

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ORG = 'cccccccccccccccccccccccc';
const PM = 'dddddddddddddddddddddddd';
const CLIENT = 'eeeeeeeeeeeeeeeeeeeeeeee';

const project = (id: string, name = 'Site rebuild') => ({ _id: id, name });

function makeService(overrides: Record<string, any> = {}) {
  const deps = {
    contracts: {
      findForPortalUser: jest.fn().mockResolvedValue([]),
      findForProject: jest.fn().mockResolvedValue([]),
    },
    approvals: {
      findForPortalUser: jest.fn().mockResolvedValue([]),
      findForProject: jest.fn().mockResolvedValue([]),
    },
    invoices: {
      findForPortalUser: jest.fn().mockResolvedValue([]),
      findForProject: jest.fn().mockResolvedValue([]),
    },
    changeRequests: {
      findForPortalUser: jest.fn().mockResolvedValue([]),
      findForProject: jest.fn().mockResolvedValue([]),
    },
    updateRequests: {
      findOpenForProjects: jest.fn().mockResolvedValue([]),
      findForProject: jest.fn().mockResolvedValue([]),
    },
    projectUpdates: { reviewQueue: jest.fn().mockResolvedValue([]) },
    notifications: { findUnreadByType: jest.fn().mockResolvedValue([]) },
    projects: {
      findProjectIdsManagedBy: jest.fn().mockResolvedValue([P1]),
      findAccessSubject: jest.fn().mockResolvedValue({
        organization: ORG,
        projectManager: PM,
        team: [],
      }),
    },
    ...overrides,
  };
  const service = new PortalDashboardService(
    deps.contracts as any,
    deps.approvals as any,
    deps.invoices as any,
    deps.changeRequests as any,
    deps.updateRequests as any,
    deps.projectUpdates as any,
    deps.notifications as any,
    deps.projects as any,
  );
  return { service, deps };
}

const client = { _id: CLIENT, role: Role.USER, organization: ORG };
const pm = { _id: PM, role: Role.MANAGER };

describe('buildSummary', () => {
  const empty = {
    contracts: [],
    approvals: [],
    invoices: [],
    changeRequests: [],
    mentions: [],
    staff: null,
  };

  it('filters each group by status', () => {
    const summary = buildSummary({
      ...empty,
      contracts: [
        { _id: 'c1', title: 'MSA', status: 'sent', project: project(P1) },
        { _id: 'c2', title: 'Old', status: 'accepted', project: project(P1) },
      ],
      approvals: [
        { _id: 'a1', title: 'Homepage', status: 'pending', project: project(P1) },
        { _id: 'a2', title: 'Logo', status: 'approved', project: project(P1) },
      ],
      changeRequests: [
        { _id: 'r1', title: 'Blog', status: 'quoted', priceAmount: 500, currency: 'USD', project: project(P1) },
        { _id: 'r2', title: 'Shop', status: 'requested', project: project(P1) },
        { _id: 'r3', title: 'Done', status: 'client_approved', project: project(P1) },
      ],
      invoices: [
        { _id: 'i1', number: 'INV-1', status: 'sent', total: 1000, currency: 'USD', dueDate: '2026-11-01T00:00:00Z', project: project(P1) },
        { _id: 'i2', number: 'INV-2', status: 'partially_paid', total: 1000, amountPaid: 400, currency: 'USD', dueDate: '2026-11-05T00:00:00Z', project: project(P1) },
        { _id: 'i3', number: 'INV-3', status: 'overdue', total: 200, currency: 'USD', dueDate: '2026-09-01T00:00:00Z', project: project(P1) },
        { _id: 'i4', number: 'INV-4', status: 'paid', total: 50, currency: 'USD', dueDate: '2026-09-01T00:00:00Z', project: project(P1) },
        { _id: 'i5', number: 'INV-5', status: 'draft', total: 50, currency: 'USD', dueDate: '2026-09-01T00:00:00Z', project: project(P1) },
      ],
    });

    expect(summary.contractsAwaitingSignature.count).toBe(1);
    expect(summary.pendingApprovals.items[0].title).toBe('Homepage');
    expect(summary.changeRequestsAwaitingDecision.count).toBe(1);
    expect(summary.changeRequestsAwaitingDecision.items[0].meta).toBe(
      'Quoted at $500.00',
    );
    // SENT + PARTIALLY_PAID, never OVERDUE / PAID / DRAFT.
    expect(summary.unpaidInvoices.items.map((i) => i._id)).toEqual(['i1', 'i2']);
    expect(summary.unpaidInvoices.items[1].meta).toBe('$600.00 due Nov 5, 2026');
    expect(summary.overdueInvoices.items.map((i) => i._id)).toEqual(['i3']);
    // Clients never get the staff groups.
    expect(summary.changeRequestsAwaitingQuote).toBeUndefined();
    expect(summary.openUpdateRequests).toBeUndefined();
    expect(summary.updatesPendingReview).toBeUndefined();
    expect(summary.total).toBe(1 + 1 + 1 + 2 + 1);
  });

  it('caps items at 5 but keeps the exact count', () => {
    const approvals = Array.from({ length: 8 }, (_, n) => ({
      _id: `a${n}`,
      title: `A${n}`,
      status: 'pending',
      project: P1,
    }));
    const summary = buildSummary({ ...empty, approvals });
    expect(summary.pendingApprovals.count).toBe(8);
    expect(summary.pendingApprovals.items).toHaveLength(5);
    // An unpopulated project id still produces a link.
    expect(summary.pendingApprovals.items[0].link).toBe(
      `/portal/projects/${P1}/decisions/approvals`,
    );
  });

  it('adds staff groups only when staff sources are given', () => {
    const summary = buildSummary({
      ...empty,
      changeRequests: [{ _id: 'r2', title: 'Shop', status: 'requested', project: project(P1) }],
      staff: {
        updateRequests: [
          { _id: 'q1', message: 'Any news?', status: 'open', project: project(P1) },
          { _id: 'q2', message: 'Thanks', status: 'closed', project: project(P1) },
        ],
        pendingUpdates: [{ _id: 'u1', title: 'Week 3', project: project(P1) }],
      },
    });
    expect(summary.changeRequestsAwaitingQuote?.count).toBe(1);
    expect(summary.openUpdateRequests?.count).toBe(1);
    expect(summary.updatesPendingReview?.count).toBe(1);
    expect(summary.total).toBe(3);
  });
});

describe('countsByTab', () => {
  it('routes mentions to the tab their link points at', () => {
    const summary = buildSummary({
      contracts: [{ _id: 'c1', title: 'MSA', status: 'sent', project: P1 }],
      approvals: [{ _id: 'a1', title: 'Home', status: 'pending', project: P1 }],
      invoices: [],
      changeRequests: [],
      mentions: [],
      staff: null,
    });
    const counts = countsByTab(summary, [
      { link: `/portal/projects/${P1}/tasks` },
      { link: `/portal/projects/${P1}/work/tasks` },
      { link: `/portal/projects/${P1}/files` },
      { link: `/portal/projects/${P1}/discussion` },
    ]);
    expect(counts).toMatchObject({
      decisions: 1,
      billing: 1,
      work: 2,
      files: 1,
      updates: 1,
    });
  });
});

describe('PortalDashboardService', () => {
  it('gives a client mentions plus their own groups, and no staff groups', async () => {
    const { service, deps } = makeService();
    deps.notifications.findUnreadByType.mockResolvedValue([
      { _id: 'n1', title: 'You were mentioned', body: 'see this', link: `/portal/projects/${P1}/discussion` },
    ]);

    const summary = await service.attentionSummary(client);

    expect(deps.changeRequests.findForPortalUser).toHaveBeenCalledWith(client, ['quoted']);
    expect(deps.notifications.findUnreadByType).toHaveBeenCalledWith(CLIENT, 'comment_mention');
    expect(deps.projectUpdates.reviewQueue).not.toHaveBeenCalled();
    expect(deps.updateRequests.findOpenForProjects).not.toHaveBeenCalled();
    expect(summary.unreadMentions.items[0]).toMatchObject({ _id: 'n1', title: '“see this”' });
    expect(summary.updatesPendingReview).toBeUndefined();
  });

  it('only shows a staff member the requests to price on projects they manage', async () => {
    const { service, deps } = makeService();
    deps.changeRequests.findForPortalUser.mockResolvedValue([
      { _id: 'mine', title: 'A', status: 'requested', project: project(P1) },
      { _id: 'theirs', title: 'B', status: 'requested', project: project(P2) },
      { _id: 'quoted', title: 'C', status: 'quoted', project: project(P2) },
    ]);

    const summary = await service.attentionSummary(pm);

    expect(deps.updateRequests.findOpenForProjects).toHaveBeenCalledWith([P1]);
    expect(summary.changeRequestsAwaitingQuote?.items.map((i) => i._id)).toEqual(['mine']);
    // Waiting-on-client items stay visible on every project they work on.
    expect(summary.changeRequestsAwaitingDecision.count).toBe(1);
  });

  it('gives an admin every project for the staff groups', async () => {
    const { service, deps } = makeService();
    await service.attentionSummary({ _id: PM, role: Role.ADMIN });
    expect(deps.projects.findProjectIdsManagedBy).not.toHaveBeenCalled();
    expect(deps.updateRequests.findOpenForProjects).toHaveBeenCalledWith(undefined);
  });

  describe('projectAttention', () => {
    it('refuses a client from another organization before reading anything', async () => {
      const { service, deps } = makeService();
      await expect(
        service.projectAttention(P1, { ...client, organization: P2 }),
      ).rejects.toThrow(ForbiddenException);
      expect(deps.contracts.findForProject).not.toHaveBeenCalled();
    });

    it("counts only this project's mentions and hides staff groups from clients", async () => {
      const { service, deps } = makeService();
      deps.approvals.findForProject.mockResolvedValue([
        { _id: 'a1', title: 'Home', status: 'pending', project: P1 },
      ]);
      deps.changeRequests.findForProject.mockResolvedValue([
        { _id: 'r1', title: 'Mine', status: 'requested', project: P1 },
        { _id: 'r2', title: 'Quoted', status: 'quoted', project: P1 },
      ]);
      deps.notifications.findUnreadByType.mockResolvedValue([
        { _id: 'n1', link: `/portal/projects/${P1}/tasks` },
        { _id: 'n2', link: `/portal/projects/${P2}/tasks` },
      ]);

      const { counts, summary } = await service.projectAttention(P1, client);

      expect(counts).toMatchObject({ decisions: 2, work: 1, billing: 0 });
      expect(summary.unreadMentions.count).toBe(1);
      expect(summary.changeRequestsAwaitingQuote).toBeUndefined();
      expect(deps.updateRequests.findForProject).not.toHaveBeenCalled();
    });

    it('gives the PM the staff groups for their project', async () => {
      const { service, deps } = makeService();
      deps.changeRequests.findForProject.mockResolvedValue([
        { _id: 'r1', title: 'Price me', status: 'requested', project: P1 },
      ]);
      deps.updateRequests.findForProject.mockResolvedValue([
        { _id: 'q1', message: 'News?', status: 'open', project: P1 },
      ]);
      deps.projectUpdates.reviewQueue.mockResolvedValue([
        { _id: 'u1', title: 'Week 3', project: project(P1) },
        { _id: 'u2', title: 'Other', project: project(P2) },
      ]);

      const { counts } = await service.projectAttention(P1, pm);

      expect(counts).toMatchObject({ decisions: 2, updates: 1 });
    });
  });
});
