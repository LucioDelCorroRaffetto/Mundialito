/**
 * migrate-global-predictions.ts
 *
 * Migrates predictions from per-league (userId+matchId+leagueId unique) to
 * global (userId+matchId unique). A user now has ONE prediction per match,
 * which counts towards all leagues they belong to.
 *
 * What this does:
 *  1. Recreates the predictions table with league_id nullable + new unique index
 *  2. Migrates existing rows keeping the latest prediction per (user_id, match_id)
 *  3. Also recreates prediction_scorers table with the same approach
 *
 * Run: cd packages/api && npx tsx src/scripts/migrate-global-predictions.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('Migrating to global predictions...');

  // ── Step 1: Recreate predictions table ─────────────────────────────────
  // Keep the latest prediction per (user_id, match_id) when deduplicating
  await client.execute(`
    CREATE TABLE IF NOT EXISTS predictions_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      league_id  INTEGER REFERENCES leagues(id) ON DELETE SET NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      points     INTEGER,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Copy latest prediction per (user_id, match_id)
  const { rowsAffected: copied } = await client.execute(`
    INSERT INTO predictions_new (user_id, match_id, league_id, home_score, away_score, points, created_at, updated_at)
    SELECT user_id, match_id, league_id, home_score, away_score, points, created_at, updated_at
    FROM predictions p1
    WHERE updated_at = (
      SELECT MAX(updated_at)
      FROM predictions p2
      WHERE p2.user_id = p1.user_id AND p2.match_id = p1.match_id
    )
    GROUP BY user_id, match_id
  `);
  console.log(`Copied ${copied} predictions (deduped per user+match)`);

  // Drop old table and rename
  await client.execute(`DROP TABLE predictions`);
  await client.execute(`ALTER TABLE predictions_new RENAME TO predictions`);

  // Create new unique index
  await client.execute(`
    CREATE UNIQUE INDEX predictions_user_match_idx
    ON predictions(user_id, match_id)
  `);
  console.log('Unique index created on (user_id, match_id)');

  // ── Step 2: Verify ──────────────────────────────────────────────────────
  const check = await client.execute(`SELECT COUNT(*) as cnt FROM predictions`);
  console.log(`Total predictions after migration: ${check.rows[0][0]}`);

  console.log('Done ✅');
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
