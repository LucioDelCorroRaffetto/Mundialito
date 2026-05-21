/**
 * add-image-columns.ts
 *
 * Migration: adds image_url column to the leagues table.
 * The users.avatar_url column already exists.
 *
 * Run with:
 *   cd packages/api && npx tsx src/scripts/add-image-columns.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function run() {
  console.log('Running migration: add image_url to leagues...');

  try {
    await client.execute(`ALTER TABLE leagues ADD COLUMN image_url TEXT`);
    console.log('✅  Added leagues.image_url');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate column')) {
      console.log('ℹ️  leagues.image_url already exists, skipping');
    } else {
      throw err;
    }
  }

  console.log('Migration complete ✅');
  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
