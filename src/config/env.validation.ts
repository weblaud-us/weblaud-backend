/**
 * Fail-fast environment validation.
 *
 * Runs once at boot, before any module is instantiated. Anything wrong here
 * throws and the process never starts — which is the point. The failure modes
 * this exists to prevent are all silent ones: a placeholder JWT secret that
 * signs perfectly valid tokens anyone can forge, an unset MONGODB_URI that
 * falls back to localhost and reports itself healthy, an unset MAIL_ADMIN that
 * sends every lead notification into a void.
 */

/** Values shipped in .env.example. Treated as "not configured", never as secrets. */
const PLACEHOLDERS = new Set([
  'replace_with_strong_secret',
  'replace_with_refresh_secret',
  'changeme',
  'secret',
  'xxxx',
  'xxxxxxxxxxxx',
]);

const MIN_SECRET_LENGTH = 32;

type Env = Record<string, unknown>;

class EnvErrors {
  private readonly errors: string[] = [];

  add(message: string) {
    this.errors.push(message);
  }

  throwIfAny() {
    if (!this.errors.length) return;
    throw new Error(
      `Invalid environment configuration:\n${this.errors
        .map((e) => `  - ${e}`)
        .join('\n')}\n\nSee .env.example for the full list of required keys.`,
    );
  }
}

function str(config: Env, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value.trim() : '';
}

function requireValue(config: Env, key: string, errors: EnvErrors): string {
  const value = str(config, key);
  if (!value) errors.add(`${key} is required but not set`);
  return value;
}

function requireSecret(config: Env, key: string, errors: EnvErrors): string {
  const value = str(config, key);

  if (!value) {
    errors.add(`${key} is required but not set`);
  } else if (PLACEHOLDERS.has(value.toLowerCase())) {
    errors.add(
      `${key} is still the placeholder value from .env.example — generate a real one ` +
        `(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")`,
    );
  } else if (value.length < MIN_SECRET_LENGTH) {
    errors.add(
      `${key} must be at least ${MIN_SECRET_LENGTH} characters (got ${value.length})`,
    );
  }

  return value;
}

export function validateEnv(config: Env): Env {
  const errors = new EnvErrors();

  // --- Runtime mode ---
  const nodeEnv = str(config, 'NODE_ENV') || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.add(
      `NODE_ENV must be one of development, production, test (got "${nodeEnv}")`,
    );
  }
  const isProduction = nodeEnv === 'production';

  // --- Database ---
  const mongoUri = requireValue(config, 'MONGODB_URI', errors);
  if (mongoUri && !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    errors.add('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }
  if (isProduction && /localhost|127\.0\.0\.1/.test(mongoUri)) {
    errors.add('MONGODB_URI points at localhost while NODE_ENV=production');
  }

  // --- Auth ---
  const jwtSecret = requireSecret(config, 'JWT_SECRET', errors);
  const jwtRefreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET', errors);
  if (jwtSecret && jwtSecret === jwtRefreshSecret) {
    errors.add(
      'JWT_SECRET and JWT_REFRESH_SECRET must differ — reusing one secret lets a ' +
        'refresh token be replayed as an access token',
    );
  }

  // --- CORS ---
  // Only enforced in production: main.ts allows all origins in development on
  // purpose, and an empty allowlist there is not a misconfiguration.
  if (isProduction) {
    const origins = str(config, 'CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (!origins.length) {
      errors.add(
        'CORS_ORIGINS is required when NODE_ENV=production — an empty allowlist ' +
          'blocks every browser request to the API, including the admin panel',
      );
    }
    for (const origin of origins) {
      if (!/^https?:\/\/[^/]+$/.test(origin)) {
        errors.add(
          `CORS_ORIGINS entry "${origin}" must be a bare scheme+host with no trailing path`,
        );
      }
    }
  }

  // --- Mail ---
  requireValue(config, 'MAIL_HOST', errors);
  requireValue(config, 'MAIL_USER', errors);
  requireValue(config, 'MAIL_PASS', errors);
  requireValue(config, 'MAIL_FROM', errors);

  // Every contact form submission and project estimate is announced here. An
  // unset value used to fall back to a hardcoded address nobody reads.
  const mailAdmin = requireValue(config, 'MAIL_ADMIN', errors);
  if (mailAdmin && !mailAdmin.includes('@')) {
    errors.add(`MAIL_ADMIN must be an email address (got "${mailAdmin}")`);
  }

  // --- File storage ---
  const storage = str(config, 'FILE_STORAGE') || 'local';
  if (!['local', 's3', 'cloudinary'].includes(storage)) {
    errors.add(
      `FILE_STORAGE must be one of local, s3, cloudinary (got "${storage}")`,
    );
  }
  if (storage === 'cloudinary') {
    requireValue(config, 'CLOUDINARY_CLOUD_NAME', errors);
    requireValue(config, 'CLOUDINARY_API_KEY', errors);
    requireValue(config, 'CLOUDINARY_API_SECRET', errors);
  }
  if (storage === 's3') {
    requireValue(config, 'AWS_REGION', errors);
    requireValue(config, 'AWS_ACCESS_KEY_ID', errors);
    requireValue(config, 'AWS_SECRET_ACCESS_KEY', errors);
    requireValue(config, 'AWS_S3_BUCKET', errors);
  }

  errors.throwIfAny();

  return config;
}
