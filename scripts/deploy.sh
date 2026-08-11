#!/usr/bin/env bash
#
# Backend deploy. Run from the backend directory on the server.
#
# The build order below is not optional. @weblaud/upload-pro is linked from a
# sibling directory (see pnpm-workspace.yaml) and its dist/ is gitignored, so a
# fresh checkout has no compiled output for it. Because pnpm links rather than
# installs, no prepare/prepublishOnly hook fires to build it either — if this
# script skips step 1, the API starts and immediately dies on
# "Cannot find module '@weblaud/upload-pro'".
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPLOAD_PRO_DIR="$(cd "$BACKEND_DIR/../upload-pro" && pwd)"

echo "==> backend:    $BACKEND_DIR"
echo "==> upload-pro: $UPLOAD_PRO_DIR"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env is missing. Copy .env.example and fill it in." >&2
  exit 1
fi

# 1. Build the linked dependency FIRST.
echo "==> [1/4] Building @weblaud/upload-pro"
cd "$UPLOAD_PRO_DIR"
npm ci
npm run build
test -f "$UPLOAD_PRO_DIR/dist/index.js" || {
  echo "ERROR: upload-pro build produced no dist/index.js" >&2
  exit 1
}

# 2. Install backend dependencies.
echo "==> [2/4] Installing backend dependencies"
cd "$BACKEND_DIR"
pnpm install --frozen-lockfile

# 3. Compile. This also copies the .hbs mail templates into dist/ via the
#    "assets" entry in nest-cli.json — without them every email throws ENOENT.
echo "==> [3/4] Building backend"
pnpm run build
test -d "$BACKEND_DIR/dist/modules/mail/templates" || {
  echo "ERROR: mail templates missing from dist/. Check nest-cli.json assets." >&2
  exit 1
}

# 4. Restart. The app validates its environment on boot and exits non-zero on
#    bad config, so a failed restart here means read the logs, don't retry.
echo "==> [4/4] Restarting PM2 process"
pm2 startOrReload "$BACKEND_DIR/ecosystem.config.js" --env production
pm2 save

echo "==> Done. Verify: curl -fsS http://127.0.0.1:4000/api/v1/health"
