import 'dotenv/config';

export const PORT = Number(process.env.PORT ?? 3000);
export const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
export const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
