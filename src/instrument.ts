/**
 * Sentry error monitoring. Imported first thing in main.ts — the SDK has to
 * load before Nest and Express to hook into them. Does nothing at all
 * unless SENTRY_DSN is set.
 *
 * Nest's ConfigModule only reads .env once the app is created, which is too
 * late here, and PM2 only passes NODE_ENV (ecosystem.config.js). So if the
 * DSN isn't already in the environment, read just the SENTRY_* keys from
 * .env ourselves — nothing else is loaded early.
 */
import * as Sentry from '@sentry/nestjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scrubSentryEvent } from './common/utils/sentry-scrub.util';

function fromDotEnv(key: string): string | undefined {
  try {
    const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const line = text
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    const value = line.slice(line.indexOf('=') + 1).trim();
    return value.replace(/^(['"])(.*)\1$/, '$2') || undefined;
  } catch {
    return undefined;
  }
}

const dsn = process.env.SENTRY_DSN || fromDotEnv('SENTRY_DSN');

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      fromDotEnv('SENTRY_ENVIRONMENT') ||
      process.env.NODE_ENV ||
      'development',
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
    // Don't collect personal data in the first place: no user fields, no
    // cookies, no bodies (contact forms, signatures), no query strings
    // (invite and unsubscribe tokens), only harmless headers…
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      httpHeaders: {
        request: { allow: ['accept', 'accept-language', 'content-type', 'host', 'user-agent'] },
        response: false,
      },
    },
    // …and scrub again before sending, in case an integration adds any.
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
