import { parseFileSize } from 'src/common/utils/parse-size.util';

export const envConfig = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  nodeEnv: process.env.NODE_ENV || 'development',

  file: {
    maxSize: parseFileSize(process.env.FILE_MAX_SIZE || '10mb'),
    allowedTypes:
      process.env.FILE_ALLOWED_TYPES || 'jpg,jpeg,png,webp,pdf,mp4,mov',
  },

  // No fallback: validateEnv guarantees this is set, and a silent localhost
  // default would let production come up connected to nothing.
  mongodb: {
    uri: process.env.MONGODB_URI,
  },

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '465', 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || 'noreply@weblaud.com',
    /** Where contact submissions and project estimates are announced. */
    admin: process.env.MAIL_ADMIN,
    /** Where job applications are announced. Falls back to the admin inbox. */
    hr: process.env.MAIL_HR || process.env.MAIL_ADMIN,
    /**
     * Signs unsubscribe-link tokens (see email-preference-token.util.ts).
     * No dedicated required env var — falls back to JWT_SECRET, which
     * validateEnv already guarantees is set and strong, the same fallback
     * pattern the frontend uses for ADMIN_SESSION_SECRET/PORTAL_SESSION_SECRET.
     */
    unsubscribeSecret:
      process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET,
  },

  admin: {
    /**
     * Origin *plus* admin path prefix of the dashboard, e.g.
     * https://weblaud.com/cpadmin. Leaf routes (/contact-submissions,
     * /applicants, …) are appended by DashboardNotifierService, so moving the
     * panel to a different path needs no code change. Trailing slash optional.
     *
     * No fallback: a plausible-looking default would ship dead "View in
     * dashboard" links in real notification email.
     */
    baseUrl: process.env.ADMIN_BASE_URL,
  },

  portal: {
    /**
     * Origin *plus* portal path prefix, e.g. https://weblaud.com/portal.
     * UsersService appends /accept-invite?uid=&token= to build the invite
     * link. No fallback for the same reason as admin.baseUrl — a wrong
     * default ships a dead invite link straight to a real client's inbox.
     */
    baseUrl: process.env.PORTAL_URL,
  },

  booking: {
    /**
     * Discovery-call scheduling link put in every lead auto-reply. Defaults
     * to the same link the website uses (BOOKING_URL in the site's
     * app/lib/constants.ts) — unlike the URLs above, this one is a real,
     * working page, so a fallback can't ship a dead link.
     */
    url: process.env.BOOKING_URL || 'https://zcal.co/i/JW03svfU',
  },

  pagespeed: {
    /**
     * Google PageSpeed Insights API key for the free /audit tool. Optional,
     * but without it every run shares Google's keyless quota, which is
     * usually exhausted — set one (free, 25k runs/day) for real use.
     */
    apiKey: process.env.PAGESPEED_API_KEY,
  },

  invite: {
    /** How long an invite acceptance link stays valid. */
    tokenTtlHours: parseInt(process.env.INVITE_TOKEN_TTL_HOURS || '72', 10),
  },

  stripe: {
    /**
     * All three are optional in every environment. Unset means "payments not
     * configured yet" — PaymentService no-ops with a clear error rather than
     * throwing, the same pattern as TrustpilotService, so a project can be
     * demoed end-to-end (contracts, invoices, approvals) before Stripe is
     * wired up for real. See PaymentService.isConfigured().
     */
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },

  internal: {
    /**
     * Shared with the website (same value in weblaud-site/.env). Proves a
     * request's X-Client-IP / X-Client-UA headers came from the website's
     * server and not from someone calling the public API directly — see
     * client-context.util.ts. Optional: unset means forwarded IPs are ignored.
     */
    apiSecret: process.env.INTERNAL_API_SECRET,
  },

  turnstile: {
    /**
     * Cloudflare Turnstile secret for the public forms (contact, estimate,
     * job application) — see CaptchaGuard. Optional so the backend can be
     * deployed before the website starts sending tokens: unset means the
     * guard lets requests through and logs a warning.
     */
    secretKey: process.env.TURNSTILE_SECRET_KEY,
  },
});
