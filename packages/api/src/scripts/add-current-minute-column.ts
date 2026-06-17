/**
 * One-shot: agrega la columna matches.current_minute a Turso prod.
 * Idempotente (skip si la columna ya existe).
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await client.execute('ALTER TABLE matches ADD COLUMN current_minute TEXT');
    console.log('[add-current-minute] OK — column added');
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('duplicate column name')) {
      console.log('[add-current-minute] column already exists, skipping');
    } else throw err;
  } finally {
    client.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
