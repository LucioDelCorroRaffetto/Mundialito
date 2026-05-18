import { createClient } from '@libsql/client';
import { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from '../constants.js';

export const libsqlClient = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

// Habilitar FKs (libSQL/SQLite las tiene deshabilitadas por default).
// Llamar desde server.ts antes de app.listen para garantizar enforcement de FKs.
export async function initDb(): Promise<void> {
  await libsqlClient.execute('PRAGMA foreign_keys = ON');
}
