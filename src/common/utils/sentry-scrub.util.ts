/**
 * Strips personal and secret data from a Sentry event before it leaves the
 * server. Allowlist, not denylist: request bodies (contact forms, invoices,
 * signatures), cookies, query strings (invite and unsubscribe tokens) and
 * every header except a few harmless ones are dropped, so a new sensitive
 * header can't leak by default. Kept in step with the site's
 * app/lib/sentry-scrub.ts.
 */
const SAFE_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'host',
  'user-agent',
]);

/** Drops the query string and fragment from a URL or path; keeps it relative if it was. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type ScrubbableEvent = {
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    query_string?: unknown;
    headers?: Record<string, string>;
    env?: unknown;
  };
  user?: { id?: string | number; [key: string]: unknown };
  breadcrumbs?: { data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
};

export function scrubSentryEvent<T>(event: T): T {
  const e = event as ScrubbableEvent;
  if (e.request) {
    delete e.request.data;
    delete e.request.cookies;
    delete e.request.query_string;
    delete e.request.env;
    if (e.request.url) e.request.url = stripQuery(e.request.url);
    if (e.request.headers) {
      e.request.headers = Object.fromEntries(
        Object.entries(e.request.headers).filter(([name]) =>
          SAFE_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }
  // An id is enough to find the account; no email, name or IP.
  if (e.user) e.user = e.user.id !== undefined ? { id: e.user.id } : {};
  for (const crumb of e.breadcrumbs ?? []) {
    for (const key of ['url', 'to', 'from']) {
      const value = crumb.data?.[key];
      if (typeof value === 'string') crumb.data![key] = stripQuery(value);
    }
  }
  return event;
}
