import { SetMetadata } from '@nestjs/common';

export const CAPTCHA_ACTION_KEY = 'captchaAction';

/**
 * The Turnstile `action` the website's widget is configured with for this
 * endpoint — see CaptchaGuard for why it is checked.
 *
 * Must match the `action` prop passed to <Turnstile> on the matching form in
 * weblaud-site (components/ui/turnstile.tsx), because Cloudflare echoes the
 * value it minted the token with back from siteverify:
 *
 *   contact            → POST /contact/submit
 *   estimate           → POST /estimates/submit
 *   job-application    → POST /careers/:id/apply
 *   audit-run          → POST /audits/run
 *   audit-claim        → POST /audits/:id/claim
 */
export const CaptchaAction = (action: string) =>
  SetMetadata(CAPTCHA_ACTION_KEY, action);
