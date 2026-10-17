import { normalizeAuditUrl } from './audit-url.util';

describe('normalizeAuditUrl', () => {
  it('accepts a bare domain and assumes https', () => {
    expect(normalizeAuditUrl('example.com')).toEqual({
      url: 'https://example.com',
      host: 'example.com',
    });
  });

  it('normalizes case, trailing slashes and fragments, keeping path and query', () => {
    expect(
      normalizeAuditUrl('  HTTP://WWW.Example.com/Shop/?a=1#top '),
    ).toEqual({
      url: 'http://www.example.com/Shop?a=1',
      host: 'www.example.com',
    });
    expect(normalizeAuditUrl('https://example.com/')?.url).toBe(
      'https://example.com',
    );
  });

  it.each([
    ['empty', ''],
    ['localhost', 'http://localhost:3000'],
    ['IPv4 literal', 'http://192.168.1.10'],
    ['IPv6 literal', 'http://[::1]/'],
    ['intranet name', 'http://intranet'],
    ['.local host', 'https://printer.local'],
    ['.internal host', 'https://api.corp.internal'],
    ['non-http scheme', 'ftp://example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['embedded credentials', 'https://user:pass@example.com'],
    ['too long', `https://example.com/${'a'.repeat(300)}`],
  ])('rejects %s', (_label, input) => {
    expect(normalizeAuditUrl(input)).toBeNull();
  });
});
