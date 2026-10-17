import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Who is actually on the other end of a request.
 *
 * Almost no request reaches this API straight from a browser: the website
 * renders on its own Node server and calls the API server-to-server, so
 * `req.ip` is that server's address for every visitor at once. Anything keyed
 * on it — the rate limiter, the IP stamped on a contract acceptance — was
 * really keyed on "the website", making every throttle a single site-wide
 * bucket (5 logins/min for everyone combined) and every e-signature record
 * the same server IP and a Node user agent.
 *
 * The website therefore forwards the visitor's IP and user agent in
 * X-Client-IP / X-Client-UA, and proves it is the website by also sending
 * X-Internal-Secret. Those headers are only believed when the secret matches —
 * anyone else calling the public API directly can set them to anything, so
 * without the secret check they would be a spoofing primitive, not a fix.
 */
export interface ClientContext {
  clientIp: string;
  clientUa: string;
}

export type RequestWithClientContext = Request & Partial<ClientContext>;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(req: Request, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export function resolveClientContext(
  req: Request,
  internalSecret: string | undefined,
): ClientContext {
  const ownUa = header(req, 'user-agent');
  const ownIp = req.ip ?? '';

  const provided = header(req, 'x-internal-secret');
  if (internalSecret && provided && secretsMatch(provided, internalSecret)) {
    return {
      // Capped: these end up in rate-limit keys and stored acceptance records.
      clientIp: header(req, 'x-client-ip').slice(0, 64) || ownIp,
      clientUa: header(req, 'x-client-ua').slice(0, 512) || ownUa,
    };
  }

  return { clientIp: ownIp, clientUa: ownUa };
}

/** Express middleware: stamps req.clientIp / req.clientUa before any guard runs. */
export function clientContextMiddleware(internalSecret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, resolveClientContext(req, internalSecret));
    next();
  };
}
