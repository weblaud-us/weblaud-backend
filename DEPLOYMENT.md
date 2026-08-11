# Backend deployment

## Build order matters

`@weblaud/upload-pro` is a sibling directory linked via `pnpm-workspace.yaml`
(`link:../upload-pro`), not a published package. Its `dist/` is gitignored, and
because pnpm *links* rather than installs, no `prepare` or `prepublishOnly`
hook fires to build it. A fresh checkout therefore has no compiled output for
it, and the API dies on startup with:

```
Error: Cannot find module '@weblaud/upload-pro'
```

Always build it first. `scripts/deploy.sh` does this and verifies the result:

```bash
cd /var/www/weblaud-backend
./scripts/deploy.sh
```

Or manually:

```bash
npm run build:all      # builds upload-pro, then the backend
```

The directory layout on the server must mirror the repo layout — `upload-pro`
sits next to `backend`:

```
/var/www/
├── weblaud-backend/     ← this repo
└── upload-pro/          ← sibling, must be checked out and built
```

## Environment

Copy `.env.example` to `.env` and fill in every key marked REQUIRED. The app
validates its environment at boot (`src/config/env.validation.ts`) and exits
non-zero with a specific message if anything is missing, too short, or still a
placeholder. A failed start here means read the error — do not retry.

Production must set:

- `NODE_ENV=production` — gates helmet, the CORS allowlist, `trust proxy`, and
  suppressed validation error detail. PM2 also sets this, but `@nestjs/config`
  never overwrites an already-set variable, so the two agree.
- `CORS_ORIGINS` — comma-separated, scheme+host only, no trailing slash. An
  empty value blocks every browser request to the API including the admin
  panel; validation rejects it rather than letting it through.
- `MAIL_ADMIN` — where contact submissions and estimates are announced.
- Two distinct `JWT_SECRET` / `JWT_REFRESH_SECRET` values of 32+ characters.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Mail templates

`.hbs` templates are copied into `dist/` by the `assets` entry in
`nest-cli.json` and resolved relative to `__dirname`, not `process.cwd()`.
If you change the build pipeline, verify they survive:

```bash
ls dist/modules/mail/templates/
```

An empty result means every email will throw at send time.

## Upload limits

`FILE_MAX_SIZE` and `FILE_ALLOWED_TYPES` are enforced by multer's `limits` and
a `fileFilter`, applied before any bytes reach S3 or Cloudinary. This matters
because `POST /careers/:id/apply` is a public, unauthenticated endpoint. The
filter requires the extension and the mime type to agree, so a renamed
executable is rejected.

Do not override `multerOptions.fileFilter` or `multerOptions.limits` in
`domain.module.ts` without replacing the checks.

---

## Credential rotation checklist

The values previously in `.env` should be treated as compromised — they sat in
plaintext on developer machines, and `weblaud-site`'s Dockerfile baked its
`.env` into image layers before `.dockerignore` was fixed. Rotate all of these
before go-live, then update the server's `.env` (never commit it):

| Credential | Where to rotate | Notes |
|---|---|---|
| `MONGODB_URI` password | Atlas → Database Access → Edit user | Also restrict the IP allowlist to the VPS |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM → Users → Security credentials | Deactivate the old key before deleting; scope the policy to the one bucket |
| `CLOUDINARY_API_SECRET` | Cloudinary → Settings → Access Keys | |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials | |
| `MAIL_PASS` | Google Account → App passwords | Revoke the old app password |
| `ADMIN_PASSWORD` | Change via the admin panel | The seed only runs when no admin exists, so editing `.env` does **not** change an existing account |
| `SESSION_SECRET` (weblaud-site) | Generate a new random value | Already rotated; invalidates existing admin sessions |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Generate new random values | Already rotated; invalidates all issued tokens |

Any image built from `weblaud-site` before the `.dockerignore` fix still
contains the old `SESSION_SECRET` in a layer. Delete those images from wherever
they are stored rather than relying on the rotation alone.
