import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MappedAudit,
  PsiResponse,
  mapLighthouseResult,
} from './lighthouse.util';
import type { AuditStrategy } from './schemas/audit.schema';

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
/** Lighthouse on a slow site can take well over 30s. */
const PSI_TIMEOUT_MS = 90_000;

/** Machine-readable failure, stored on the audit and shown as friendly copy. */
export class PageSpeedError extends Error {
  constructor(
    readonly reason: 'quota' | 'unreachable' | 'timeout' | 'api',
    message: string,
  ) {
    super(message);
  }
}

/** Thin client for Google's PageSpeed Insights API. */
@Injectable()
export class PageSpeedService implements OnModuleInit {
  private readonly logger = new Logger(PageSpeedService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.config.get<string>('pagespeed.apiKey')) {
      this.logger.warn(
        "PAGESPEED_API_KEY is not set — /audit runs on Google's shared keyless quota, which is usually exhausted. Set a key for real use.",
      );
    }
  }

  async run(url: string, strategy: AuditStrategy): Promise<MappedAudit> {
    const params = new URLSearchParams({ url, strategy });
    for (const category of [
      'performance',
      'seo',
      'accessibility',
      'best-practices',
    ]) {
      params.append('category', category);
    }
    const key = this.config.get<string>('pagespeed.apiKey');
    if (key) params.set('key', key);

    let response: Response;
    try {
      response = await fetch(`${PSI_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new PageSpeedError(
        timedOut ? 'timeout' : 'api',
        timedOut
          ? 'PageSpeed timed out'
          : `PageSpeed request failed: ${String(err)}`,
      );
    }

    const body = (await response.json().catch(() => null)) as
      (PsiResponse & { error?: { code?: number; message?: string } }) | null;

    if (!response.ok || !body || body.error) {
      const status = body?.error?.code ?? response.status;
      const message = body?.error?.message ?? response.statusText;
      if (status === 429) throw new PageSpeedError('quota', message);
      // PSI answers 400/500 with "Lighthouse returned error: FAILED_DOCUMENT_REQUEST"
      // and similar when it can't load the page itself.
      if (
        /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_FCP|unable to (reach|resolve)/i.test(
          message ?? '',
        )
      ) {
        throw new PageSpeedError('unreachable', message);
      }
      throw new PageSpeedError('api', `PageSpeed ${status}: ${message}`);
    }

    if (body.lighthouseResult?.runtimeError?.code) {
      throw new PageSpeedError(
        'unreachable',
        body.lighthouseResult.runtimeError.message ??
          body.lighthouseResult.runtimeError.code,
      );
    }

    return mapLighthouseResult(body);
  }
}
