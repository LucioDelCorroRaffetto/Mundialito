/**
 * One-shot: re-runs syncFifaStatsForMatch with force:true for every finished
 * match in prod. Use when the matcher gained a fix that resolves goal scorers
 * that were previously left orphaned — without this, the goleadores
 * leaderboard stays incomplete because those goals never got credited in
 * player_match_stats.
 *
 * Idempotent: each call deletes+reinserts match_events for the match and
 * upserts player_match_stats, so running twice produces the same result.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches } from '../db/schema/index.js';
import { syncFifaStatsForMatch } from '../services/sync-fifa-stats.js';
import { recomputeAllFantasyPoints } from '../services/fantasy-scoring-service.js';

async function main() {
  const finished = await db
    .select({ id: matches.id, matchNumber: matches.matchNumber })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  console.log(`[resync] ${finished.length} matches to re-sync`);
  let succeeded = 0;
  let failed = 0;
  for (const m of finished) {
    try {
      const r = await syncFifaStatsForMatch(m.id, { force: true });
      const detail = r.skipped ? `skipped: ${r.skipped}` : `matched=${r.matched} upserted=${r.upserted} unmatched=${r.unmatched.length}`;
      console.log(`  #${String(m.matchNumber).padStart(2)} id=${m.id} → ${detail}`);
      succeeded++;
    } catch (err) {
      console.error(`  #${String(m.matchNumber).padStart(2)} id=${m.id} → ERROR ${String(err)}`);
      failed++;
    }
  }
  console.log(`[resync] succeeded=${succeeded} failed=${failed}`);

  if (succeeded > 0) {
    console.log('[resync] recomputing fantasy points across all leagues...');
    await recomputeAllFantasyPoints();
    console.log('[resync] done');
  }
}

main().catch((err) => {
  console.error('[resync] fatal:', err);
  process.exit(1);
});
