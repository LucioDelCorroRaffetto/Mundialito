/**
 * Schema migration — adds the FIFA.com identifier columns:
 *   - matches.fifa_id_match
 *   - matches.fifa_id_stage
 *   - players.fifa_id_player
 *
 * These power the free auto-sync of per-player stats during WC 2026,
 * replacing the API-Football integration whose free tier blocks the
 * tournament. Idempotent.
 */
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });

async function alterIfMissing(sqlText: string, description: string) {
  try {
    await client.execute(sqlText);
    console.log(`  ✓ ${description}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate column')) {
      console.log(`  · ${description} — column already exists`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log(`[add-fifa-ids] target: ${url}\n`);
  await alterIfMissing(`ALTER TABLE matches ADD COLUMN fifa_id_match TEXT`, 'matches.fifa_id_match');
  await alterIfMissing(`ALTER TABLE matches ADD COLUMN fifa_id_stage TEXT`, 'matches.fifa_id_stage');
  await alterIfMissing(`ALTER TABLE players ADD COLUMN fifa_id_player TEXT`, 'players.fifa_id_player');
  console.log('\n[add-fifa-ids] done.');
  await client.close();
}

main().catch((err) => {
  console.error('[add-fifa-ids] failed:', err);
  process.exit(1);
});
