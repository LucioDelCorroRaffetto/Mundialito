/**
 * add-player-match-stats.ts
 *
 * Creates the `player_match_stats` table, which records the real-world
 * performance of each player in each match (used by the fantasy scoring engine).
 *
 * Run: cd packages/api && npx tsx src/scripts/add-player-match-stats.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('Creating player_match_stats table...');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS player_match_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      played       INTEGER NOT NULL DEFAULT 0,
      goals        INTEGER NOT NULL DEFAULT 0,
      assists      INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_card     INTEGER NOT NULL DEFAULT 0
    )
  `);

  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS player_match_stats_match_player_idx
      ON player_match_stats(match_id, player_id)
  `);

  console.log('Table player_match_stats and unique index created');

  const check = await client.execute(`SELECT COUNT(*) FROM player_match_stats`);
  console.log(`Rows in player_match_stats: ${check.rows[0][0]}`);

  console.log('Done ✅');
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
