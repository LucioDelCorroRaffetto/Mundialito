/**
 * Schema migration — adds `matches.score_locked` (INTEGER, default 0).
 *
 * When 1, the score sync feeds (sync-scores / sync-espn) stop overwriting
 * home_score/away_score and stop re-scoring predictions for that match. Used
 * as a manual override when a feed is wrong.
 *
 * Caso que lo motivó (jun-2026): football-data publicó ESP-KSA (match 39) 5-0
 * cuando terminó 4-0 (ESPN y la timeline FIFA = 4 goles). Sin este flag el
 * sync revertía la corrección del admin cada 3 min. Idempotente.
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
  console.log(`[add-score-locked] target: ${url}\n`);
  await alterIfMissing(
    `ALTER TABLE matches ADD COLUMN score_locked INTEGER NOT NULL DEFAULT 0`,
    'matches.score_locked',
  );
  console.log('\n[add-score-locked] done.');
  await client.close();
}

main().catch((err) => {
  console.error('[add-score-locked] failed:', err);
  process.exit(1);
});
