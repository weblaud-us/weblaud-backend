/**
 * Uploads dist/ source maps to Sentry after `nest build`, so a production
 * stack trace points at the TypeScript that threw instead of a compiled
 * dist/*.js line.
 *
 * Does nothing at all without SENTRY_AUTH_TOKEN, so a local `pnpm run build`
 * is unaffected. deploy.sh runs `pnpm run build` without exporting .env into
 * the shell, so — exactly as src/instrument.ts does for SENTRY_DSN — read
 * that one key from the env file ourselves rather than changing the deploy.
 *
 * Unlike SENTRY_DSN, the auth token is a write credential: it belongs in .env
 * on the server only, never in this repo, and is never printed here.
 */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const { SentryCli } = require('@sentry/cli');

const ORG = 'weblaud';
const PROJECT = 'backend';
const DIST = join(__dirname, '..', 'dist');

function fromDotEnv(key) {
  try {
    // Same file instrument.ts reads (.env.local under scripts/local.js).
    const text = readFileSync(
      join(process.cwd(), process.env.ENV_FILE || '.env'),
      'utf8',
    );
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

const authToken =
  process.env.SENTRY_AUTH_TOKEN || fromDotEnv('SENTRY_AUTH_TOKEN');

if (!authToken) {
  console.log(
    '[sentry] SENTRY_AUTH_TOKEN not set — skipping source map upload. ' +
      'Stack traces will show dist/*.js lines.',
  );
  process.exit(0);
}

const env = {
  ...process.env,
  SENTRY_AUTH_TOKEN: authToken,
  SENTRY_ORG: ORG,
  SENTRY_PROJECT: PROJECT,
};

// `inject` stamps a debug ID into each dist file and its map; that ID is what
// ties an incoming event's frames to the right map. `upload` on its own would
// fall back to matching by release and path, which breaks quietly.
for (const args of [
  ['sourcemaps', 'inject', DIST],
  ['sourcemaps', 'upload', DIST],
]) {
  execFileSync(SentryCli.getPath(), args, { stdio: 'inherit', env });
}

console.log(`[sentry] Source maps uploaded for ${ORG}/${PROJECT}.`);
