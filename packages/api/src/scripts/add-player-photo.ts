/**
 * add-player-photo.ts
 *
 * Adds photo_url column to the players table.
 *
 * Run: cd packages/api && npx tsx src/scripts/add-player-photo.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('Adding photo_url column to players...');
  await client.execute(`ALTER TABLE players ADD COLUMN photo_url TEXT`);
  console.log('Done ✅');
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
