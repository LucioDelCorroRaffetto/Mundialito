/**
 * One-shot: adds the matches.live_status column to prod Turso.
 *
 * Drizzle-kit push can't run against this codebase because the schema
 * files use ESM `.js` imports that its CJS loader rejects. Single
 * additive nullable column → safe to ALTER manually.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const client = createClient({ url, authToken });
  try {
    await client.execute('ALTER TABLE matches ADD COLUMN live_status TEXT');
    console.log('[add-live-status] OK — column added');
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('duplicate column name')) {
      console.log('[add-live-status] column already exists, skipping');
    } else {
      throw err;
    }
  } finally {
    client.close();
  }
}

main().catch((e) => {
  console.error('[add-live-status] failed:', e);
  process.exit(1);
});
