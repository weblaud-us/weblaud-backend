import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CAPTCHA_ACTION_KEY } from 'src/common/decorators/captcha-action.decorator';
import type { RequestWithClientContext } from 'src/common/utils/client-context.util';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export const CAPTCHA_HEADER = 'x-captcha-token';

/** Cloudflare echoes back the action and hostname the token was minted with. */
interface SiteverifyResponse {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Cloudflare rejects anything longer outright; checking first keeps a bot from
 * using this endpoint to push arbitrary payloads at siteverify on our behalf.
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * Cloudflare's published testing secrets (always-passes, always-fails,
 * already-spent). They verify normally but echo back NO `action` and a fixed
 * `hostname` of "example.com", so the action and hostname bindings below
 * cannot be evaluated against them — with the real checks applied, local dev
 * using the matching test sitekey would have every submission rejected.
 *
 * Verification itself still runs, so the always-fails and already-spent keys
 * behave as intended for testing; only the two bindings are skipped.
 */
const TURNSTILE_TESTING_SECRETS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

/**
 * Cloudflare Turnstile check for the public, unauthenticated writes
 * (contact form, estimate lead, job application).
 *
 * Lives on the backend rather than in the website's form actions because these
 * endpoints are directly reachable on the public API — the website's honeypot
 * and time-trap never ran for a bot that posted to /contact/submit itself,
 * which is how the spam was getting in.
 *
 * The token travels in the X-Captcha-Token header rather than the body so the
 * strict ValidationPipe (forbidNonWhitelisted) doesn't need a captcha field on
 * every DTO, and so it works the same for the multipart job application.
 * Guards run before interceptors, so a failed check stops a résumé upload
 * before any bytes reach storage.
 *
 * With TURNSTILE_SECRET_KEY unset the guard lets requests through (with a
 * warning) — that is what makes it safe to deploy the backend before the
 * website starts sending tokens. Once set, it fails closed: an unreachable
 * Cloudflare rejects the submission rather than waving it through.
 *
 * A valid token on its own is not enough. Cloudflare reports which `action`
 * and `hostname` the token was minted for, and without checking them a token
 * is fungible: one taken from the contact widget replays against the job
 * application endpoint, and one farmed from a widget embedded on an
 * attacker's own page is accepted here. Routes declare their expected action
 * with @CaptchaAction, which must match the `action` prop on the matching
 * form in weblaud-site.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  private readonly logger = new Logger(CaptchaGuard.name);
  private warnedUnconfigured = false;
  private warnedNoHostnames = false;
  private warnedNoAction = false;
  private warnedTestingSecret = false;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('turnstile.secretKey');
    if (!secret) {
      if (!this.warnedUnconfigured) {
        this.logger.warn(
          'TURNSTILE_SECRET_KEY is not set — public forms are accepted without a bot check.',
        );
        this.warnedUnconfigured = true;
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithClientContext>();
    const raw = req.headers[CAPTCHA_HEADER];
    const token = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      throw new BadRequestException(
        'Please complete the verification and try again.',
      );
    }

    const body = new URLSearchParams({ secret, response: token });
    if (req.clientIp) body.set('remoteip', req.clientIp);

    let result: SiteverifyResponse;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      result = (await response.json()) as SiteverifyResponse;
    } catch (err) {
      this.logger.error(
        'Turnstile verification request failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException(
        'We could not verify your submission right now. Please try again in a moment.',
      );
    }

    if (!result.success) {
      this.logger.warn(
        `Turnstile rejected a submission: ${(result['error-codes'] ?? []).join(', ') || 'no error code'}`,
      );
      throw new BadRequestException(
        'Please complete the verification and try again.',
      );
    }

    if (TURNSTILE_TESTING_SECRETS.has(secret)) {
      if (!this.warnedTestingSecret) {
        this.warnedTestingSecret = true;
        this.logger.warn(
          "TURNSTILE_SECRET_KEY is one of Cloudflare's testing secrets — the " +
            'action and hostname bindings are skipped. Never deploy this to production.',
        );
      }
      return true;
    }

    // Every rejection below reuses the message above on purpose: telling a
    // caller *which* check it failed is a free oracle for tuning around it.
    // The specifics go to the log instead.
    const expectedAction = this.reflector.getAllAndOverride<string | undefined>(
      CAPTCHA_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!expectedAction) {
      // A route protected by this guard but missing @CaptchaAction accepts a
      // token minted anywhere on the site. Not fatal, but it is a hole.
      if (!this.warnedNoAction) {
        this.warnedNoAction = true;
        this.logger.warn(
          `${context.getClass().name}.${context.getHandler().name} uses CaptchaGuard without @CaptchaAction — ` +
            'a token from any other form on the site is accepted here.',
        );
      }
    } else if (result.action !== expectedAction) {
      this.logger.warn(
        `Turnstile action mismatch: token was minted for "${result.action ?? 'none'}", ` +
          `this endpoint expects "${expectedAction}" — a replayed or farmed token.`,
      );
      throw new BadRequestException(
        'Please complete the verification and try again.',
      );
    }

    const allowedHostnames =
      this.config.get<string[]>('turnstile.hostnames') ?? [];

    if (allowedHostnames.length === 0) {
      if (!this.warnedNoHostnames) {
        this.warnedNoHostnames = true;
        this.logger.warn(
          'TURNSTILE_HOSTNAMES is not set — a token minted by this sitekey on any ' +
            'page, including one an attacker embeds the widget on, is accepted. ' +
            'Set it to the hostnames the site is served from.',
        );
      }
    } else if (
      !allowedHostnames.includes((result.hostname ?? '').toLowerCase())
    ) {
      this.logger.warn(
        `Turnstile hostname "${result.hostname ?? 'none'}" is not in TURNSTILE_HOSTNAMES — ` +
          'the token was minted on a page we do not serve.',
      );
      throw new BadRequestException(
        'Please complete the verification and try again.',
      );
    }

    return true;
  }
}
