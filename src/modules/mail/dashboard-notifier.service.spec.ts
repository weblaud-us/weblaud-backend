import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DashboardNotifierService } from './dashboard-notifier.service';
import { MailService } from './mail.service';

const BASE = 'https://weblaud.com/cpadmin';

interface SentRow {
  label: string;
  value: string;
  href?: string;
}

interface SentEmail {
  to: string;
  subject: string;
  template: string;
  context: {
    heading: string;
    intro?: string;
    sections: { title?: string; rows: SentRow[] }[];
    dashboardUrl: string;
    receivedAt: string;
    recordId?: string;
  };
}

describe('DashboardNotifierService', () => {
  let service: DashboardNotifierService;
  let mail: { sendEmail: jest.Mock };
  let config: { get: jest.Mock };

  /** Config stub: `admin.baseUrl` and `mail.admin`, both overridable per test. */
  const withConfig = (values: Record<string, string | undefined>) => {
    config.get.mockImplementation((key: string) => values[key]);
  };

  const sent = () => mail.sendEmail.mock.calls[0][0] as SentEmail;

  beforeEach(async () => {
    mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    config = { get: jest.fn() };
    withConfig({ 'admin.baseUrl': BASE, 'mail.admin': 'admin@example.com' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardNotifierService,
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(DashboardNotifierService);
  });

  afterEach(() => jest.restoreAllMocks());

  const notify = (overrides = {}) =>
    service.notifyNew({
      kind: 'contact message',
      rows: [{ label: 'Name', value: 'Ada' }],
      dashboardPath: '/contact-submissions',
      ...overrides,
    });

  describe('recipient', () => {
    it('defaults to mail.admin', async () => {
      await notify();
      expect(sent().to).toBe('admin@example.com');
    });

    it('honours an explicit recipient', async () => {
      await notify({ to: 'hr@example.com' });
      expect(sent().to).toBe('hr@example.com');
    });

    it('logs and sends nothing when no recipient is configured', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      withConfig({ 'admin.baseUrl': BASE });

      await expect(notify()).resolves.toBeUndefined();

      expect(mail.sendEmail).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    });
  });

  describe('dashboard URL', () => {
    it.each([
      ['plain base', BASE, '/contact-submissions'],
      ['trailing slash', `${BASE}/`, '/contact-submissions'],
      ['many trailing slashes', `${BASE}///`, '/contact-submissions'],
      ['surrounding whitespace', `  ${BASE}  `, '/contact-submissions'],
      ['path without leading slash', BASE, 'contact-submissions'],
    ])('joins correctly — %s', async (_label, baseUrl, dashboardPath) => {
      withConfig({
        'admin.baseUrl': baseUrl,
        'mail.admin': 'admin@example.com',
      });

      await notify({ dashboardPath });

      expect(sent().context.dashboardUrl).toBe(`${BASE}/contact-submissions`);
    });

    it('preserves a query string', async () => {
      await notify({ dashboardPath: '/applicants?email=ada%40example.com' });

      expect(sent().context.dashboardUrl).toBe(
        `${BASE}/applicants?email=ada%40example.com`,
      );
    });

    it('still sends, with no URL, when ADMIN_BASE_URL is unset', async () => {
      withConfig({ 'mail.admin': 'admin@example.com' });

      await notify();

      expect(mail.sendEmail).toHaveBeenCalled();
      expect(sent().context.dashboardUrl).toBe('');
    });
  });

  describe('rows', () => {
    it('drops empty values and keeps the rest', async () => {
      await notify({
        rows: [
          { label: 'Name', value: 'Ada' },
          { label: 'Company', value: undefined },
          { label: 'Phone', value: null },
          { label: 'Notes', value: '   ' },
          { label: 'Tags', value: [] },
          { label: 'Weeks', value: 7 },
        ],
      });

      expect(sent().context.sections[0].rows).toEqual([
        { label: 'Name', value: 'Ada', href: undefined },
        { label: 'Weeks', value: '7', href: undefined },
      ]);
    });

    it('joins array values', async () => {
      await notify({
        rows: [{ label: 'Capabilities', value: ['Auth', 'Chat'] }],
      });

      expect(sent().context.sections[0].rows[0].value).toBe('Auth, Chat');
    });

    it('groups consecutive rows sharing a section', async () => {
      await notify({
        rows: [
          { label: 'Name', value: 'Ada' },
          { section: 'Scope', label: 'Project type', value: 'Operations' },
          { section: 'Scope', label: 'Pace', value: 'Standard' },
          { section: 'Estimate', label: 'Timeline', value: '7 weeks' },
        ],
      });

      expect(sent().context.sections).toEqual([
        {
          title: undefined,
          rows: [expect.objectContaining({ label: 'Name' })],
        },
        {
          title: 'Scope',
          rows: [
            expect.objectContaining({ label: 'Project type' }),
            expect.objectContaining({ label: 'Pace' }),
          ],
        },
        {
          title: 'Estimate',
          rows: [expect.objectContaining({ label: 'Timeline' })],
        },
      ]);
    });

    it('carries href through', async () => {
      await notify({
        rows: [
          {
            label: 'Email',
            value: 'ada@example.com',
            href: 'mailto:ada@example.com',
          },
        ],
      });

      expect(sent().context.sections[0].rows[0].href).toBe(
        'mailto:ada@example.com',
      );
    });
  });

  describe('envelope', () => {
    it('uses the shared template and a kind-specific subject', async () => {
      await notify();

      expect(sent().template).toBe('dashboard-alert');
      expect(sent().subject).toBe('New contact message — WebLaud dashboard');
    });

    it('defaults the heading to the kind and allows an override', async () => {
      await notify();
      expect(sent().context.heading).toBe('New contact message');

      mail.sendEmail.mockClear();
      await notify({ heading: 'New application — Engineer' });
      expect(sent().context.heading).toBe('New application — Engineer');
    });

    it('always stamps receivedAt', async () => {
      await notify();

      // The old per-service templates rendered "Received at {{date}}" while the
      // contact service never passed `date`. Stamping centrally makes that
      // class of bug impossible.
      expect(sent().context.receivedAt).toEqual(expect.any(String));
      expect(sent().context.receivedAt).not.toBe('');
    });
  });

  // The invariant every call site depends on: services `await notifyNew(...)`
  // with no try/catch of their own, having already persisted the record.
  it('resolves and logs when the send fails, never rethrowing', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    mail.sendEmail.mockRejectedValue(new Error('smtp down'));

    await expect(notify({ recordId: 'abc' })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('abc'),
      expect.any(String),
    );
  });
});
