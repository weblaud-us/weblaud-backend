/**
 * Absolute website URL for a site-root path, given PORTAL_URL.
 *
 * PORTAL_URL is the portal's base *including* its path prefix
 * (https://weblaud.com/portal), while every link the backend builds —
 * notification links, checkout return paths — is already a full site path
 * starting with "/portal/...". Plain concatenation produced
 * https://weblaud.com/portal/portal/..., a 404, in every notification email,
 * the unsubscribe link and the Stripe return page. Resolving the path as a
 * URL against PORTAL_URL keeps only its origin for absolute paths, so either
 * shape of PORTAL_URL (with or without the /portal suffix) works.
 *
 * Returns undefined when PORTAL_URL is unset or unparseable, so callers can
 * omit the link rather than mail a broken one.
 */
export function siteUrl(
  portalBaseUrl: string | undefined,
  path: string,
): string | undefined {
  if (!portalBaseUrl?.trim()) return undefined;
  try {
    return new URL(path, portalBaseUrl.trim()).toString();
  } catch {
    return undefined;
  }
}
