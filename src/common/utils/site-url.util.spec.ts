import { siteUrl } from './site-url.util';

describe('siteUrl', () => {
  it('does not double the /portal prefix (the bug every notification email had)', () => {
    expect(
      siteUrl('https://weblaud.com/portal', '/portal/projects/abc/invoices'),
    ).toBe('https://weblaud.com/portal/projects/abc/invoices');
  });

  it('works whether or not PORTAL_URL carries a trailing slash or the /portal suffix', () => {
    expect(siteUrl('https://weblaud.com/portal/', '/portal/x')).toBe(
      'https://weblaud.com/portal/x',
    );
    expect(siteUrl('https://weblaud.com', '/portal/x')).toBe(
      'https://weblaud.com/portal/x',
    );
  });

  it('places site-root pages (unsubscribe) at the root, not under /portal', () => {
    expect(
      siteUrl(
        'https://weblaud.com/portal',
        '/email-preferences/unsubscribe?uid=1&token=t',
      ),
    ).toBe('https://weblaud.com/email-preferences/unsubscribe?uid=1&token=t');
  });

  it('returns undefined rather than a broken link when PORTAL_URL is unset or invalid', () => {
    expect(siteUrl(undefined, '/portal')).toBeUndefined();
    expect(siteUrl('', '/portal')).toBeUndefined();
    expect(siteUrl('not a url', '/portal')).toBeUndefined();
  });
});
