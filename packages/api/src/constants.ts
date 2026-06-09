import 'dotenv/config';

export const PORT = Number(process.env.PORT ?? 3000);
export const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
export const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
export const NODE_ENV = process.env.NODE_ENV ?? 'development';

// JWT secrets — REQUIRED in production. The previous defaults
// ('dev-access-secret' / 'dev-refresh-secret') are public knowledge in the
// repo, so booting prod without env vars set would let anyone forge tokens.
// Fail loud at boot instead of silently degrading security.
const isProd = NODE_ENV === 'production';
const ACCESS_FROM_ENV = process.env.JWT_ACCESS_SECRET;
const REFRESH_FROM_ENV = process.env.JWT_REFRESH_SECRET;
if (isProd && (!ACCESS_FROM_ENV || !REFRESH_FROM_ENV)) {
  console.error(
    '[FATAL] JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production. ' +
    'Refusing to start with dev defaults.',
  );
  process.exit(1);
}
export const JWT_ACCESS_SECRET = ACCESS_FROM_ENV ?? 'dev-access-secret';
export const JWT_REFRESH_SECRET = REFRESH_FROM_ENV ?? 'dev-refresh-secret';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
