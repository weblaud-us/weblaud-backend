import { ConfigService } from '@nestjs/config';
import { LeadReplyService, greetingName } from './lead-reply.service';
import { MailService } from '../mail/mail.service';

describe('greetingName', () => {
  it('uses the first word of a plain name', () => {
    expect(greetingName('Ada Lovelace')).toBe('Ada');
    expect(greetingName("  Siobhán O'Neil ")).toBe('Siobhán');
    expect(greetingName('Jean-Luc')).toBe('Jean-Luc');
  });

  it('drops anything that could smuggle text into the auto-reply', () => {
    expect(greetingName('www.cheap-pills.example')).toBeUndefined();
    expect(greetingName('http://evil.example')).toBeUndefined();
    expect(greetingName('<b>Hi</b>')).toBeUndefined();
    expect(greetingName('A'.repeat(41))).toBeUndefined();
    expect(greetingName('')).toBeUndefined();
    expect(greetingName(undefined)).toBeUndefined();
  });
});

describe('LeadReplyService', () => {
  const settings: Record<string, string | undefined> = {
    'booking.url': 'https://zcal.co/i/JW03svfU',
    'portal.baseUrl': 'https://weblaud.com/portal',
    'mail.admin': 'leads@weblaud.com',
  };
  let mail: { sendEmail: jest.Mock };
  let service: LeadReplyService;

  beforeEach(() => {
    mail = { sendEmail: jest.fn().mockResolvedValue({}) };
    service = new LeadReplyService(
      mail as unknown as MailService,
      { get: (key: string) => settings[key] } as unknown as ConfigService,
    );
  });

  it('sends the confirmation with booking link, site links and a working reply-to', async () => {
    await expect(
      service.sendContactConfirmation('ada@example.com', 'Ada'),
    ).resolves.toBe(true);

    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        template: 'lead-received',
        replyTo: 'leads@weblaud.com',
        context: {
          name: 'Ada',
          bookingUrl: 'https://zcal.co/i/JW03svfU',
          calculatorUrl: 'https://weblaud.com/calculator',
          projectsUrl: 'https://weblaud.com/projects',
        },
      }),
    );
  });

  it('formats the emailed estimate', async () => {
    await service.sendEstimateSummary('ada@example.com', 'Ada Lovelace', {
      projectTypeTitle: 'Operations',
      featureTitles: ['Auth'],
      speedLabel: 'Standard',
      totalWeeks: 7,
      costMin: 5000,
      costMax: 6500,
    });

    expect(mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your Operations estimate — Weblaud',
        template: 'estimate-summary',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matcher
        context: expect.objectContaining({
          name: 'Ada',
          costRange: '$5,000 – $6,500',
          totalWeeks: 7,
        }),
      }),
    );
  });

  it('resolves false instead of rejecting when mail fails', async () => {
    mail.sendEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      service.sendContactConfirmation('ada@example.com', 'Ada'),
    ).resolves.toBe(false);
  });
});

describe('audit report email (rendered through the real template)', () => {
  const settings: Record<string, string | undefined> = {
    'booking.url': 'https://zcal.co/i/JW03svfU',
    'portal.baseUrl': 'https://weblaud.com/portal',
    'mail.admin': 'leads@weblaud.com',
    'mail.from': 'noreply@weblaud.com',
  };
  const config = {
    get: (key: string) => settings[key],
  } as unknown as ConfigService;

  const render = async (issueCount: number) => {
    const sendMail = jest.fn<Promise<object>, [{ html: string }]>(() =>
      Promise.resolve({}),
    );
    const mail = new MailService(
      { sendMail } as unknown as ConstructorParameters<typeof MailService>[0],
      config,
    );
    const sent = await new LeadReplyService(mail, config).sendAuditReport(
      'ada@example.com',
      'Ada Lovelace',
      {
        host: 'example.com',
        strategy: 'mobile',
        scores: {
          performance: 42,
          seo: 83,
          accessibility: 95,
          bestPractices: 100,
        },
        vitals: { lcpMs: 6123, cls: 0.046, tbtMs: 813, fcpMs: 2400 },
        issues: Array.from({ length: issueCount }, (_, i) => ({
          title: `Issue <${i}>`,
          savingsMs: i === 0 ? 1450 : undefined,
        })),
      },
    );
    expect(sent).toBe(true);
    return sendMail.mock.calls[0][0].html;
  };

  it('shows each score with a text label, the vitals and the top five issues', async () => {
    const html = await render(7);

    expect(html).toContain('Ada, here');
    expect(html).toContain('example.com &middot; tested on mobile');
    expect(html).toMatch(/Performance[\s\S]*42[\s\S]*Poor/);
    expect(html).toMatch(/SEO[\s\S]*83[\s\S]*Needs work/);
    expect(html).toMatch(/Accessibility[\s\S]*95[\s\S]*Good/);
    expect(html).toContain('6.1 s');
    expect(html).toContain('could save ~1.4 s');
    // Escaped, top five only, and the remainder summarized.
    expect(html).toContain('Issue &lt;4&gt;');
    expect(html).not.toContain('Issue &lt;5&gt;');
    expect(html).toContain('plus 2 more issues');
    // The audited site is never turned into a link.
    expect(html).not.toMatch(/href="[^"]*example\.com/);
  });

  it('says so when Lighthouse found nothing to fix', async () => {
    const html = await render(0);
    expect(html).toContain('found no significant issues');
    expect(html).not.toContain('more issue');
  });
});
