/**
 * One-off migration: move predictions from global (user, match) to per-league
 * (user, match, league).
 *
 * Steps:
 *   1. Add `predictions_visibility` column to `leagues` (idempotent).
 *   2. Rebuild `predictions` table with NOT NULL league_id and a new unique
 *      index on (user_id, match_id, league_id). Existing rows are expanded:
 *      each prediction becomes one row per league the user belongs to.
 *      Predictions whose user has no leagues are dropped.
 *
 * Safe to re-run: detects the new schema and exits early.
 *
 * Run with: pnpm --filter @mundialito/api exec tsx src/scripts/migrate-predictions-per-league.ts
 */
import 'dotenv/config';
import { libsqlClient } from '../db/client.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const res = await libsqlClient.execute(`PRAGMA table_info(${table})`);
  return res.rows.some((r: any) => r.name === column);
}

async function indexExists(name: string): Promise<boolean> {
  const res = await libsqlClient.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='index' AND name = ?`,
    args: [name],
  });
  return res.rows.length > 0;
}

async function isLeagueIdNotNull(): Promise<boolean> {
  const res = await libsqlClient.execute(`PRAGMA table_info(predictions)`);
  const row = res.rows.find((r: any) => r.name === 'league_id') as any;
  return !!row && row.notnull === 1;
}

async function run() {
  console.log('[migrate] starting predictions-per-league migration');

  // 1) leagues.predictions_visibility
  if (!(await columnExists('leagues', 'predictions_visibility'))) {
    console.log('[migrate] adding leagues.predictions_visibility');
    await libsqlClient.execute(
      `ALTER TABLE leagues ADD COLUMN predictions_visibility TEXT NOT NULL DEFAULT 'after_kickoff'`
    );
  } else {
    console.log('[migrate] leagues.predictions_visibility already present');
  }

  // 2) predictions schema
  if (await isLeagueIdNotNull()) {
    console.log('[migrate] predictions.league_id already NOT NULL — assuming already migrated');
    return;
  }

  console.log('[migrate] rebuilding predictions table');

  // Build the expanded data set first so we know exactly what to insert.
  const existing = await libsqlClient.execute(
    `SELECT id, user_id, match_id, league_id, home_score, away_score, points,
            created_at, updated_at
       FROM predictions`
  );

  // Capture scorers so we can re-link them to the new prediction rows after the rebuild.
  // Each scorer row stores (prediction_id, player_id); we tag it with the source
  // prediction's (user, match, old_league) so we can match it to its expanded copies.
  const oldPredById = new Map<number, any>();
  for (const row of existing.rows as any[]) oldPredById.set(Number(row.id), row);

  const scorerRows = await libsqlClient.execute(
    `SELECT prediction_id, player_id FROM prediction_scorers`
  );

  const memberships = await libsqlClient.execute(
    `SELECT user_id, league_id FROM league_members`
  );
  const userLeagues = new Map<number, number[]>();
  for (const row of memberships.rows as any[]) {
    const uid = Number(row.user_id);
    const lid = Number(row.league_id);
    if (!userLeagues.has(uid)) userLeagues.set(uid, []);
    userLeagues.get(uid)!.push(lid);
  }

  type NewRow = {
    user_id: number;
    match_id: number;
    league_id: number;
    home_score: number;
    away_score: number;
    points: number | null;
    created_at: string;
    updated_at: string;
  };

  // Deduplicate per (user, match, league): if a user had a prediction with a
  // specific league_id, prefer that one; otherwise propagate to all leagues.
  const byUserMatch = new Map<string, any[]>();
  for (const row of existing.rows as any[]) {
    const key = `${row.user_id}:${row.match_id}`;
    if (!byUserMatch.has(key)) byUserMatch.set(key, []);
    byUserMatch.get(key)!.push(row);
  }

  const expanded: NewRow[] = [];
  const seen = new Set<string>();
  for (const [, rows] of byUserMatch) {
    // Prefer rows that already had a league_id (most recent wins on tie).
    const sorted = [...rows].sort((a, b) => {
      const aHas = a.league_id != null ? 1 : 0;
      const bHas = b.league_id != null ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });

    const userId = Number(sorted[0].user_id);
    const matchId = Number(sorted[0].match_id);
    const leagues = userLeagues.get(userId) ?? [];

    // For each league, pick the prediction explicitly tied to it, else fall
    // back to the most recent row with no league_id.
    const fallback = sorted.find((r) => r.league_id == null) ?? sorted[0];

    for (const leagueId of leagues) {
      const specific = sorted.find((r) => Number(r.league_id) === leagueId);
      const source = specific ?? fallback;
      const dedupeKey = `${userId}:${matchId}:${leagueId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      expanded.push({
        user_id: userId,
        match_id: matchId,
        league_id: leagueId,
        home_score: Number(source.home_score),
        away_score: Number(source.away_score),
        points: source.points == null ? null : Number(source.points),
        created_at: String(source.created_at),
        updated_at: String(source.updated_at),
      });
    }
  }

  console.log(
    `[migrate] expanded ${existing.rows.length} predictions to ${expanded.length} rows ` +
      `across ${userLeagues.size} users`
  );

  // SQLite table rebuild. Foreign keys are turned off for the rename dance.
  // The client proxy re-enables PRAGMA foreign_keys per statement, so we run
  // the whole rebuild inside one batch.
  const stmts: string[] = [];

  // Drop old unique index if present so it doesn't collide with the new table's index name.
  if (await indexExists('predictions_user_match_idx')) {
    stmts.push('DROP INDEX predictions_user_match_idx');
  }
  if (await indexExists('predictions_user_match_league_idx')) {
    stmts.push('DROP INDEX predictions_user_match_league_idx');
  }
  if (await indexExists('predictions_match_league_idx')) {
    stmts.push('DROP INDEX predictions_match_league_idx');
  }

  stmts.push(`CREATE TABLE predictions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    points INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Run the DDL first as a batch (no FK pain because the table is empty).
  await libsqlClient.batch(stmts, 'write');

  // Insert in chunks to keep statement size sane.
  const CHUNK = 200;
  for (let i = 0; i < expanded.length; i += CHUNK) {
    const slice = expanded.slice(i, i + CHUNK);
    const placeholders = slice
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ');
    const args: any[] = [];
    for (const r of slice) {
      args.push(
        r.user_id,
        r.match_id,
        r.league_id,
        r.home_score,
        r.away_score,
        r.points,
        r.created_at,
        r.updated_at
      );
    }
    await libsqlClient.execute({
      sql: `INSERT INTO predictions_new
              (user_id, match_id, league_id, home_score, away_score, points, created_at, updated_at)
            VALUES ${placeholders}`,
      args,
    });
  }

  // Drop scorers first because they FK to predictions(id), then swap tables.
  // We re-insert scorers afterwards based on (user, match, league).
  await libsqlClient.batch(
    [
      'DELETE FROM prediction_scorers',
      'DROP TABLE predictions',
      'ALTER TABLE predictions_new RENAME TO predictions',
      'CREATE UNIQUE INDEX predictions_user_match_league_idx ON predictions (user_id, match_id, league_id)',
      'CREATE INDEX predictions_match_league_idx ON predictions (match_id, league_id)',
    ],
    'write'
  );

  // Re-link scorers: for each old (prediction_id, player_id), find the new
  // prediction rows that derived from that prediction's (user, match) — that
  // can be multiple rows if the old prediction had no league_id and was
  // propagated to all the user's leagues.
  if (scorerRows.rows.length > 0) {
    const newPreds = await libsqlClient.execute(
      `SELECT id, user_id, match_id, league_id FROM predictions`
    );
    const newIdByKey = new Map<string, number>();
    for (const r of newPreds.rows as any[]) {
      newIdByKey.set(`${r.user_id}:${r.match_id}:${r.league_id}`, Number(r.id));
    }

    const scorerInserts: { predId: number; playerId: number }[] = [];
    const dedupe = new Set<string>();
    for (const s of scorerRows.rows as any[]) {
      const oldPred = oldPredById.get(Number(s.prediction_id));
      if (!oldPred) continue;
      const userId = Number(oldPred.user_id);
      const matchId = Number(oldPred.match_id);
      const leagues = userLeagues.get(userId) ?? [];
      const targetLeagues =
        oldPred.league_id != null ? [Number(oldPred.league_id)] : leagues;
      for (const lid of targetLeagues) {
        const newId = newIdByKey.get(`${userId}:${matchId}:${lid}`);
        if (!newId) continue;
        const k = `${newId}:${s.player_id}`;
        if (dedupe.has(k)) continue;
        dedupe.add(k);
        scorerInserts.push({ predId: newId, playerId: Number(s.player_id) });
      }
    }

    console.log(`[migrate] re-linking ${scorerInserts.length} scorer rows`);

    for (let i = 0; i < scorerInserts.length; i += CHUNK) {
      const slice = scorerInserts.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '(?, ?)').join(', ');
      const args: any[] = [];
      for (const r of slice) args.push(r.predId, r.playerId);
      await libsqlClient.execute({
        sql: `INSERT INTO prediction_scorers (prediction_id, player_id) VALUES ${placeholders}`,
        args,
      });
    }
  }

  console.log('[migrate] done');
}

run().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
