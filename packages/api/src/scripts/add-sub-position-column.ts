/** One-shot migration: agrega players.sub_position en prod Turso. */
import 'dotenv/config';
import { createClient } from '@libsql/client';

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await client.execute('ALTER TABLE players ADD COLUMN sub_position TEXT');
    console.log('[add-sub-position] OK — column added');
  } catch (err: any) {
    if (String(err?.message ?? err).includes('duplicate column name')) {
      console.log('[add-sub-position] column already exists, skipping');
    } else throw err;
  } finally {
    client.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
