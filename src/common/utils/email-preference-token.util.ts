import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless proof that an unsubscribe link's recipient is who it claims to
 * be, without a DB round trip (unlike invite/OTP tokens, which are
 * bcrypt-hashed and stored). A link is only ever a GET with no session, so
 * there's nothing to look up against — an HMAC keyed on the server's own
 * secret is what makes uid=X unforgeable without needing to store or
 * expire anything per-recipient. Never expires by design: an old email in
 * someone's inbox should still be able to unsubscribe them.
 */
export function signUnsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex');
}

export function verifyUnsubscribeToken(
  userId: string,
  token: string,
  secret: string,
): boolean {
  if (!token) return false;
  const expected = signUnsubscribeToken(userId, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(token, 'hex');
  // Buffer.from() on a malformed (non-hex) token can produce a
  // shorter-than-expected buffer — length must match before
  // timingSafeEqual runs, or it throws instead of just failing closed.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
