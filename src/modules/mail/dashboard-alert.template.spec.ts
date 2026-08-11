import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DashboardNotifierService } from './dashboard-notifier.service';
import { MailService } from './mail.service';

/**
 * Renders dashboard-alert.hbs through the real MailService against a stub
 * transporter, so this covers the actual template file — including whether it
 * is still being emitted to dist/ by the `assets` entry in nest-cli.json. If
 * that copy ever breaks, this fails instead of production email.
 */
describe('dashboard-alert.hbs', () => {
  let notifier: DashboardNotifierService;
  let sendMail: jest.Mock;

  const html = () => (sendMail.mock.calls[0][0] as { html: string }).html;

  const build = async (baseUrl?: string) => {
    sendMail = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        DashboardNotifierService,
        { provide: 'MAIL_TRANSPORTER', useValue: { sendMail } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                'admin.baseUrl': baseUrl,
                'mail.admin': 'admin@example.com',
                'mail.from': 'WebLaud <noreply@weblaud.com>',
              })[key],
          },
        },
      ],
    }).compile();

    notifier = module.get(DashboardNotifierService);
  };

  const notify = (overrides = {}) =>
    notifier.notifyNew({
      kind: 'contact message',
      rows: [
        { label: 'Name', value: 'Ada Lovelace' },
        {
          label: 'Email',
          value: 'ada@example.com',
          href: 'mailto:ada@example.com',
        },
      ],
      dashboardPath: '/contact-submissions',
      ...overrides,
    });

  it('renders the requested "check the dashboard" copy', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify();

    expect(html()).toContain('please check the dashboard');
  });

  it('renders the heading, rows and links', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify();

    expect(html()).toContain('New contact message');
    expect(html()).toContain('Ada Lovelace');
    expect(html()).toContain('href="mailto:ada@example.com"');
  });

  it('renders a section heading when rows are grouped', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify({
      rows: [{ section: 'Scope', label: 'Project type', value: 'Operations' }],
    });

    expect(html()).toContain('Scope');
    expect(html()).toContain('Operations');
  });

  it('escapes values — they come from unauthenticated public forms', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify({
      rows: [{ label: 'Message', value: '<script>alert(1)</script>' }],
    });

    expect(html()).toContain('&lt;script&gt;');
    expect(html()).not.toContain('<script>alert(1)</script>');
  });

  it('renders the CTA pointing at the joined URL', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify();

    expect(html()).toContain('View in dashboard');
    expect(html()).toContain(
      'href="https://weblaud.com/cpadmin/contact-submissions"',
    );
  });

  it('omits the CTA entirely when no base URL is configured', async () => {
    await build(undefined);
    await notify();

    expect(html()).not.toContain('View in dashboard');
    expect(html()).not.toContain('undefined');
  });

  it('renders a populated Received at footer', async () => {
    await build('https://weblaud.com/cpadmin');
    await notify({ recordId: 'abc123' });

    // The bug this replaces: the old contact template rendered a bare
    // "Received at " because the service never passed `date`.
    expect(html()).toMatch(/Received at \w/);
    expect(html()).toContain('abc123');
  });
});
