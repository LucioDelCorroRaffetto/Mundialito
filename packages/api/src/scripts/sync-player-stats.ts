/**
 * CLI wrapper around syncPlayerStatsForMatch — fetches per-player stats
 * from API-Football for one or more match IDs.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-player-stats.ts <matchId> [matchId…]
 *   pnpm --filter @mundialito/api exec tsx src/scripts/sync-player-stats.ts --all-finished
 *
 * `--all-finished` walks every match in status='finished' and runs the sync
 * for the ones whose `playerMatchStats` set is empty (saves API quota by
 * skipping matches that already have stats).
 *
 * Required env: API_FOOTBALL_KEY. Also requires that
 * `backfill-api-fixture-ids.ts` has been run at least once to populate
 * matches.apiFixtureId — without it the service returns the
 * "apiFixtureId not mapped" skip reason for every match.
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, playerMatchStats } from '../db/schema/index.js';
import { syncPlayerStatsForMatch } from '../services/sync-player-stats.js';

async function resolveTargets(): Promise<number[]> {
  const args = process.argv.slice(2);
  if (args.includes('--all-finished')) {
    const finished = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.status, 'finished'));
    if (finished.length === 0) return [];
    const finishedIds = finished.map((m) => m.id);
    // Skip matches that already have at least one player_match_stats row —
    // re-syncing them would waste API quota during the tournament. Use
    // POST /admin/matches/:id/sync-player-stats for a deliberate refresh.
    const alreadySynced = await db
      .selectDistinct({ matchId: playerMatchStats.matchId })
      .from(playerMatchStats)
      .where(inArray(playerMatchStats.matchId, finishedIds));
    const syncedSet = new Set(alreadySynced.map((r) => r.matchId));
    return finishedIds.filter((id) => !syncedSet.has(id));
  }
  return args.map((a) => Number(a)).filter((n) => Number.isFinite(n) && n > 0);
}

async function main() {
  const targets = await resolveTargets();
  if (targets.length === 0) {
    console.log('No matches to sync. Pass match IDs or --all-finished.');
    return;
  }
  console.log(`[sync-player-stats] processing ${targets.length} match(es)…`);

  let okCount = 0;
  for (const matchId of targets) {
    try {
      const result = await syncPlayerStatsForMatch(matchId);
      if (result.skipped) {
        console.log(`  · match ${matchId} — skipped: ${result.skipped}`);
      } else {
        okCount++;
        console.log(
          `  ✓ match ${matchId} — matched=${result.matched} upserted=${result.upserted} unmatched=${result.unmatched.length}`,
        );
        if (result.unmatched.length > 0) {
          for (const name of result.unmatched.slice(0, 10)) console.log(`      · ${name}`);
          if (result.unmatched.length > 10) {
            console.log(`      … and ${result.unmatched.length - 10} more`);
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ match ${matchId} failed:`, err instanceof Error ? err.message : err);
    }
    // Polite pause — API-Football free tier is 10 req/min.
    // Previous 700ms (~85 req/min) would have triggered 429 on the first
    // tier almost immediately. 6.5s = ~9 req/min, safe.
    await new Promise((r) => setTimeout(r, 6_500));
  }
  console.log(`\n[sync-player-stats] done — ${okCount} sync(s) completed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[sync-player-stats] fatal:', err);
    process.exit(1);
  });
