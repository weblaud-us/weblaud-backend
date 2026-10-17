import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestWithClientContext } from 'src/common/utils/client-context.util';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export const CAPTCHA_HEADER = 'x-captcha-token';

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

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
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  private readonly logger = new Logger(CaptchaGuard.name);
  private warnedUnconfigured = false;

  constructor(private readonly config: ConfigService) {}

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
    if (!token) {
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

    return true;
  }
}
