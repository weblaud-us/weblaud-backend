#!/usr/bin/env bash
#
# Backend deploy. Run from the backend directory on the server.
#
# @weblaud/upload-pro is installed from the npm registry like any other
# dependency — this repo no longer needs a sibling upload-pro checkout, and
# nothing here builds it. Publishing a new version of that package is a
# separate action; bump the range in package.json to pick it up.
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> backend: $BACKEND_DIR"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env is missing. Copy .env.example and fill it in." >&2
  exit 1
fi

# 1. Install dependencies.
echo "==> [1/3] Installing backend dependencies"
cd "$BACKEND_DIR"
pnpm install --frozen-lockfile

# 2. Compile. This also copies the .hbs mail templates into dist/ via the
#    "assets" entry in nest-cli.json — without them every email throws ENOENT.
echo "==> [2/3] Building backend"
pnpm run build
test -d "$BACKEND_DIR/dist/modules/mail/templates" || {
  echo "ERROR: mail templates missing from dist/. Check nest-cli.json assets." >&2
  exit 1
}

# 3. Restart. The app validates its environment on boot and exits non-zero on
#    bad config, so a failed restart here means read the logs, don't retry.
echo "==> [3/3] Restarting PM2 process"
pm2 startOrReload "$BACKEND_DIR/ecosystem.config.js" --env production
pm2 save

echo "==> Done. Verify: curl -fsS http://127.0.0.1:4000/api/v1/health"
