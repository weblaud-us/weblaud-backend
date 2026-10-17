const MAX_URL_LENGTH = 300;
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home'];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type NormalizedAuditUrl = { url: string; host: string };

/**
 * Validates and normalizes a visitor-typed website address for auditing.
 *
 * Google fetches the page, not us, so this isn't an SSRF guard — it keeps the
 * stored data clean, keeps the 24h result cache keyed consistently, and stops
 * pointless runs (localhost, IPs, intranet names) from burning API quota.
 * Accepts a bare domain ("example.com") and assumes https.
 *
 * Returns null for anything we won't audit.
 */
export function normalizeAuditUrl(raw: string): NormalizedAuditUrl | null {
  const input = raw?.trim();
  if (!input || input.length > MAX_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`,
    );
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !host.includes('.') ||
    host.startsWith('[') || // IPv6 literal
    IPV4.test(host) ||
    host === 'localhost' ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return null;
  }

  parsed.hostname = host;
  parsed.hash = '';
  // Default port and a trailing slash on the bare origin are noise for the
  // cache key; query strings are kept (they can change what's served).
  const path =
    parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  const url = `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;

  return url.length > MAX_URL_LENGTH ? null : { url, host };
}
