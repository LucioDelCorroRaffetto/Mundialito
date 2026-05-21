/**
 * migrate-global-fantasy.ts
 *
 * Migrates fantasy teams from per-league (one per user+league)
 * to global (one per user). Keeps the latest squad per user.
 *
 * Run: cd packages/api && npx tsx src/scripts/migrate-global-fantasy.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  console.log('Migrating to global fantasy teams...');

  // 1. Recreate fantasy_teams with nullable league_id and unique on user_id
  await client.execute(`
    CREATE TABLE IF NOT EXISTS fantasy_teams_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      league_id    INTEGER REFERENCES leagues(id) ON DELETE SET NULL,
      name         TEXT    NOT NULL DEFAULT 'Mi equipo',
      total_points INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Copy latest team per user (keep the one with highest id if duplicates)
  const { rowsAffected } = await client.execute(`
    INSERT INTO fantasy_teams_new (id, user_id, league_id, name, total_points, updated_at)
    SELECT id, user_id, league_id, name, total_points, updated_at
    FROM fantasy_teams ft1
    WHERE id = (
      SELECT MAX(id) FROM fantasy_teams ft2 WHERE ft2.user_id = ft1.user_id
    )
  `);
  console.log(`Copied ${rowsAffected} fantasy teams`);

  // fantasy_squad_players references fantasy_teams.id — those rows are kept as-is
  // (only orphaned ones from duplicate teams get cleaned by CASCADE later)

  await client.execute(`DROP TABLE fantasy_teams`);
  await client.execute(`ALTER TABLE fantasy_teams_new RENAME TO fantasy_teams`);
  await client.execute(`
    CREATE UNIQUE INDEX fantasy_teams_user_idx ON fantasy_teams(user_id)
  `);
  console.log('Unique index created on (user_id)');

  const check = await client.execute(`SELECT COUNT(*) FROM fantasy_teams`);
  console.log(`Total fantasy teams after migration: ${check.rows[0][0]}`);

  console.log('Done ✅');
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
