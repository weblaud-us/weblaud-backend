import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// See invoice.service.spec.ts: these pull in the User schema, which ts-jest's
// isolated compilation can't build. All behaviour comes from the mocks.
jest.mock('src/modules/dashboard/portal-dashboard.service', () => ({
  PortalDashboardService: class PortalDashboardService {},
}));
jest.mock('src/modules/users/users.service', () => ({
  UsersService: class UsersService {},
}));

import { ProjectDigestService, startOfUtcWeek } from './project-digest.service';
import { MailService } from 'src/modules/mail/mail.service';

const PROJECT = '507f1f77bcf86cd799439011';
const ORG = '507f1f77bcf86cd799439012';
// Monday 2026-10-19, 08:00 UTC — the cron's own slot.
const NOW = new Date('2026-10-19T08:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function emptyGroup() {
  return { count: 0, items: [] as { _id: string; title: string; meta: string }[] };
}
function emptySummary() {
  return {
    contractsAwaitingSignature: emptyGroup(),
    pendingApprovals: emptyGroup(),
    changeRequestsAwaitingDecision: emptyGroup(),
    unpaidInvoices: emptyGroup(),
    overdueInvoices: emptyGroup(),
    unreadMentions: emptyGroup(),
    total: 0,
  };
}

/** find(query).sort().limit().select().lean() → rows, with every query recorded. */
function listModel(rows: unknown[] = []) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
  return { find: jest.fn().mockReturnValue(chain) };
}

describe('startOfUtcWeek', () => {
  it('is Monday 00:00 UTC', () => {
    expect(startOfUtcWeek(new Date('2026-10-19T08:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(startOfUtcWeek(new Date('2026-10-25T23:59:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(startOfUtcWeek(new Date('2026-10-18T12:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
});

describe('ProjectDigestService', () => {
  let projects: { find: jest.Mock; findOneAndUpdate: jest.Mock };
  let tasks: ReturnType<typeof listModel>;
  let updates: ReturnType<typeof listModel>;
  let files: ReturnType<typeof listModel>;
  let invoices: ReturnType<typeof listModel>;
  let dashboard: { projectAttention: jest.Mock };
  let users: { findDigestRecipientsForOrgs: jest.Mock };
  let mail: { sendEmail: jest.Mock };
  let project: Record<string, unknown>;

  const build = () =>
    new ProjectDigestService(
      projects as any,
      tasks as any,
      updates as any,
      files as any,
      invoices as any,
      dashboard as any,
      users as any,
      mail as any,
      {
        get: (key: string) =>
          ({
            'portal.baseUrl': 'https://weblaud.com/portal',
            'mail.unsubscribeSecret': 'x'.repeat(32),
          })[key],
      } as any,
    );

  beforeEach(() => {
    project = {
      _id: PROJECT,
      name: 'Site rebuild',
      organization: ORG,
      timeline: { milestones: [] },
    };
    projects = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockImplementation(() => Promise.resolve([project])),
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: PROJECT }),
    };
    tasks = listModel();
    updates = listModel();
    files = listModel();
    invoices = listModel();
    dashboard = {
      projectAttention: jest.fn().mockResolvedValue({ counts: {}, summary: emptySummary() }),
    };
    users = {
      findDigestRecipientsForOrgs: jest.fn().mockResolvedValue(
        new Map([
          [
            ORG,
            [
              { _id: 'u1', firstName: 'Ana', email: 'ana@client.test' },
              { _id: 'u2', firstName: 'Ben', email: 'ben@client.test' },
            ],
          ],
        ]),
      ),
    };
    mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  });

  it('skips a project whose week had nothing in it — and does not claim it', async () => {
    const sent = await build().sendWeeklyDigests(NOW);
    expect(sent).toBe(0);
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(projects.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('sends one email per opted-in client user when something happened', async () => {
    tasks = listModel([{ title: 'Checkout flow' }]);

    const sent = await build().sendWeeklyDigests(NOW);

    expect(sent).toBe(2);
    expect(users.findDigestRecipientsForOrgs).toHaveBeenCalledWith([ORG]);
    const first = mail.sendEmail.mock.calls[0][0];
    expect(first).toMatchObject({
      to: 'ana@client.test',
      template: 'weekly-digest',
      subject: 'Your week on Site rebuild',
    });
    expect(first.context.completed).toEqual([{ title: 'Checkout flow' }]);
    expect(first.context.actionUrl).toBe(`https://weblaud.com/portal/projects/${PROJECT}`);
    expect(first.context.unsubscribeUrl).toContain('category=digest');
    expect(first.context.unsubscribeUrl).toContain('uid=u1');
  });

  it('sends nothing to an org whose users all opted out', async () => {
    tasks = listModel([{ title: 'Checkout flow' }]);
    users.findDigestRecipientsForOrgs.mockResolvedValue(new Map());
    await expect(build().sendWeeklyDigests(NOW)).resolves.toBe(0);
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('a second run in the same week sends nothing', async () => {
    tasks = listModel([{ title: 'Checkout flow' }]);
    const service = build();
    await service.sendWeeklyDigests(NOW);
    mail.sendEmail.mockClear();

    // The claim filter now fails: lastDigestAt is already this week.
    projects.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.sendWeeklyDigests(new Date(NOW.getTime() + 3_600_000))).resolves.toBe(0);
    expect(mail.sendEmail).not.toHaveBeenCalled();

    // And the claim only matches a lastDigestAt from before this Monday.
    const claimFilter = projects.findOneAndUpdate.mock.calls[0][0];
    expect(JSON.stringify(claimFilter)).toContain(startOfUtcWeek(NOW).toISOString());
  });

  it('builds each section from the right window', async () => {
    project.timeline = {
      milestones: [
        { title: 'Design signed off', status: 'done', completedAt: daysAgo(2) },
        { title: 'Old milestone', status: 'done', completedAt: daysAgo(30) },
        { title: 'Launch', status: 'pending' },
      ],
    };
    updates = listModel([{ title: 'Week 3' }]);
    files = listModel([{ name: 'wireframes.pdf' }]);
    invoices = listModel([
      { number: 'INV-9', total: 1500, currency: 'USD', dueDate: new Date('2026-10-28T00:00:00Z') },
    ]);
    const summary = emptySummary();
    summary.pendingApprovals = {
      count: 1,
      items: [{ _id: 'a1', title: 'Homepage design', meta: 'On Site rebuild' }],
    };
    dashboard.projectAttention.mockResolvedValue({ counts: {}, summary });

    const content = await build().buildContent(project as any, NOW);

    expect(content.completed).toEqual([{ title: 'Design signed off', meta: 'Milestone' }]);
    expect(content.updates).toEqual([{ title: 'Week 3' }]);
    expect(content.files).toEqual([{ title: 'wireframes.pdf' }]);
    expect(content.waiting).toEqual([{ title: 'Homepage design', meta: 'On Site rebuild' }]);
    expect(content.dueSoon).toEqual([{ title: 'Invoice INV-9', meta: '$1,500.00 due Oct 28' }]);

    // Clients only: visible tasks, client files, published updates.
    expect(tasks.find).toHaveBeenCalledWith(
      expect.objectContaining({ clientVisible: true, status: 'done' }),
    );
    expect(files.find).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'client' }));
    expect(updates.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
    // The inbox is computed as a client of this org would see it.
    expect(dashboard.projectAttention).toHaveBeenCalledWith(PROJECT, {
      role: 'user',
      organization: ORG,
    });
  });
});

/** Renders the real weekly-digest.hbs through MailService, so a broken template or a missing nest-cli asset copy fails here. */
describe('weekly-digest.hbs', () => {
  it('renders every section and the unsubscribe link', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: 'MAIL_TRANSPORTER', useValue: { sendMail } },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => ({ 'mail.from': 'WebLaud <noreply@weblaud.com>' })[key] },
        },
      ],
    }).compile();

    await moduleRef.get(MailService).sendEmail({
      to: 'ana@client.test',
      subject: 'Your week on Site rebuild',
      template: 'weekly-digest',
      context: {
        firstName: 'Ana',
        projectName: 'Site rebuild',
        completed: [{ title: 'Checkout flow' }],
        updates: [{ title: 'Week 3' }],
        files: [],
        waiting: [{ title: 'Homepage design', meta: 'On Site rebuild' }],
        dueSoon: [{ title: 'Invoice INV-9', meta: '$1,500.00 due Oct 28' }],
        actionUrl: 'https://weblaud.com/portal/projects/x',
        unsubscribeUrl: 'https://weblaud.com/email-preferences/unsubscribe?category=digest',
      },
    });

    const html = (sendMail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('Waiting on you');
    expect(html).toContain('Checkout flow');
    expect(html).toContain('Invoice INV-9');
    expect(html).not.toContain('Files shared with you');
    // Handlebars HTML-escapes '=' in the href; browsers decode it.
    expect(html).toMatch(/category(=|&#x3D;)digest/);
  });
});
