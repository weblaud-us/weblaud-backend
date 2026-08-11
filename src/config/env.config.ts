import { parseFileSize } from 'src/common/utils/parse-size.util';

export const envConfig = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  nodeEnv: process.env.NODE_ENV || 'development',

  file: {
    maxSize: parseFileSize(process.env.FILE_MAX_SIZE || '10mb'),
    allowedTypes:
      process.env.FILE_ALLOWED_TYPES || 'jpg,jpeg,png,webp,pdf,mp4,mov',
  },

  // No fallback: validateEnv guarantees this is set, and a silent localhost
  // default would let production come up connected to nothing.
  mongodb: {
    uri: process.env.MONGODB_URI,
  },

  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '465', 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || 'noreply@weblaud.com',
    /** Where contact submissions and project estimates are announced. */
    admin: process.env.MAIL_ADMIN,
    /** Where job applications are announced. Falls back to the admin inbox. */
    hr: process.env.MAIL_HR || process.env.MAIL_ADMIN,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
