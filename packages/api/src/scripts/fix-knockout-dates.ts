/**
 * fix-knockout-dates.ts
 *
 * Fetches the real FIFA WC 2026 knockout schedule and updates placeholder
 * kickoff times for matches 73-104 (R32 → Final).
 *
 * Problem:
 *   The seed generated R32 dates starting 2026-07-04 with 12-hour intervals,
 *   spreading them over July 4-12. The real FIFA schedule starts R32 on July 1
 *   and finishes by July 4, with R16 starting July 4. Seed dates are 3+ days
 *   ahead of reality for early rounds.
 *
 * Strategy:
 *   1. Fetch FIFA calendar (July 1–22) and deduplicate by IdMatch.
 *   2. For matches with known teams (not TBD): match to FIFA by team code.
 *   3. For QF/SF/3rd/Final (positional — counts match exactly):
 *      sort FIFA matches and our matches chronologically, pair 1:1.
 *   4. R16 is fully known → positional match.
 *   5. R32 TBD slots are skipped; run this script again once groups are done.
 *
 * Run:
 *   pnpm --filter @mundialito/api exec tsx src/scripts/fix-knockout-dates.ts
 *   DRY_RUN=1 pnpm --filter @mundialito/api exec tsx src/scripts/fix-knockout-dates.ts
 */
import 'dotenv/config';
import { db } from '../db/index.js';
import { initDb } from '../db/client.js';
import { matches, teams } from '../db/schema/index.js';
import { eq, gt, inArray } from 'drizzle-orm';
import { calcPredictionLock } from '../lib/match-helpers.js';

const FIFA_BASE = 'https://api.fifa.com/api/v3/calendar/matches';
const FIFA_COMPETITION = '17';
const FIFA_SEASON = '285023';
const DRY_RUN = process.env.DRY_RUN === '1';

interface FifaMatch {
  IdMatch: string;
  IdStage: string;
  Date: string;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Fetch all FIFA matches in [from, to) day range, deduplicating by IdMatch. */
async function fetchFifaWindow(from: Date, to: Date): Promise<FifaMatch[]> {
  const seen = new Set<string>();
  const out: FifaMatch[] = [];
  const fromMs = startOfUtcDay(from).getTime();
  const toMs = startOfUtcDay(new Date(to.getTime() + 24 * 3600 * 1000 - 1)).getTime();

  for (let t = fromMs; t < toMs; t += 24 * 3600 * 1000) {
    const start = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const end = new Date(t + 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const url =
      `${FIFA_BASE}?idCompetition=${FIFA_COMPETITION}&idSeason=${FIFA_SEASON}` +
      `&from=${start}&to=${end}&language=en&count=30`;

    let data: any;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        console.warn(`  FIFA ${res.status} for ${start}`);
        continue;
      }
      data = await res.json();
    } catch (err) {
      console.warn(`  Fetch error for ${start}: ${err}`);
      continue;
    }

    const ms: any[] = data?.Results ?? [];
    for (const m of ms) {
      if (m?.IdMatch && m?.IdStage && m?.Date && !seen.has(m.IdMatch)) {
        seen.add(m.IdMatch);
        out.push({ IdMatch: m.IdMatch, IdStage: m.IdStage, Date: m.Date });
      }
    }
  }

  return out;
}

/** Normalise FIFA 3-letter code → our team code (same overrides as backfill). */
const FIFA_CODE_OVERRIDES: Record<string, string> = { RSA: 'ZAF' };
function normFifaCode(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return FIFA_CODE_OVERRIDES[upper] ?? upper;
}

async function main(): Promise<void> {
  console.log(`[fix-knockout-dates] dryRun=${DRY_RUN}`);
  await initDb();

  // 1. Fetch FIFA calendar July 1-22 (entire knockout window).
  console.log('Fetching FIFA calendar (July 1 – July 22)...');
  const fifaAll = await fetchFifaWindow(
    new Date('2026-07-01T00:00:00Z'),
    new Date('2026-07-22T00:00:00Z'),
  );
  console.log(`  Got ${fifaAll.length} unique matches from FIFA.`);

  // Build a lookup: IdMatch → FifaMatch.
  const fifaById = new Map(fifaAll.map((m) => [m.IdMatch, m]));

  // Group by IdStage (for positional rounds).
  const byStage = new Map<string, FifaMatch[]>();
  for (const m of fifaAll) {
    if (!byStage.has(m.IdStage)) byStage.set(m.IdStage, []);
    byStage.get(m.IdStage)!.push(m);
  }

  // Sort each stage chronologically.
  for (const [, ms] of byStage) {
    ms.sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
  }

  // Print stages for visibility.
  console.log('Stages:');
  for (const [id, ms] of byStage) {
    console.log(`  IdStage=${id} → ${ms.length} matches (${ms[0]?.Date?.slice(0, 10)} – ${ms.at(-1)?.Date?.slice(0, 10)})`);
  }

  // Identify positional rounds by expected match count.
  // R32=16 or ~10 (some TBD slots missing), R16=8, QF=4, SF=2, 3rd=1, final=1.
  const positionalByRound = new Map<string, FifaMatch[]>();

  // Sort stages by earliest match date so we process them in tournament order.
  const stagesByDate = [...byStage.entries()].sort(
    ([, a], [, b]) => new Date(a[0].Date).getTime() - new Date(b[0].Date).getTime(),
  );

  for (const [stageId, ms] of stagesByDate) {
    const count = ms.length;

    if (count >= 8 && count <= 16 && !positionalByRound.has('r32')) {
      // First large stage = R32 (may have fewer than 16 if some slots are TBD).
      positionalByRound.set('r32', ms);
    } else if (count >= 7 && count <= 9 && !positionalByRound.has('r16')) {
      // Second large stage = R16 (8 matches).
      positionalByRound.set('r16', ms);
    } else if (count === 4) {
      positionalByRound.set('qf', ms);
    } else if (count === 2) {
      positionalByRound.set('sf', ms);
    } else if (count === 1) {
      if (!positionalByRound.has('third')) {
        positionalByRound.set('third', ms);
      } else {
        const thirdDate = new Date(positionalByRound.get('third')![0].Date).getTime();
        const thisDate = new Date(ms[0].Date).getTime();
        if (thisDate < thirdDate) {
          positionalByRound.set('final', positionalByRound.get('third')!);
          positionalByRound.set('third', ms);
        } else {
          positionalByRound.set('final', ms);
        }
      }
    } else {
      console.warn(`  Stage ${stageId} (${count} matches) — no round matched, skipping.`);
    }
  }

  // 2. Load our knockout matches from DB.
  const ourMatches = await db.select().from(matches).where(gt(matches.matchNumber, 72));

  // Load team codes for each match.
  const teamIds = ourMatches
    .flatMap((m) => [m.homeTeamId, m.awayTeamId])
    .filter((id): id is number => id != null && id > 0);
  const teamRows = await db
    .select({ id: teams.id, code: teams.code })
    .from(teams)
    .where(inArray(teams.id, [...new Set(teamIds)]));
  const codeById = new Map(teamRows.map((t) => [t.id, t.code.toUpperCase()]));

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  // Track match DB IDs that were successfully updated by team-code matching,
  // so the positional loop can skip them (avoid double-updating).
  const teamCodeUpdatedIds = new Set<number>();

  // 3. For R32/R16 matches with known (non-TBD) teams: match by team code.
  // Use the FULL tournament calendar (June 11 – July 19) which includes team info,
  // same approach as backfill-fifa-match-ids.ts.
  console.log('\nFetching full FIFA WC calendar for team-code matching...');
  const bulkUrl =
    `${FIFA_BASE}?idCompetition=${FIFA_COMPETITION}&idSeason=${FIFA_SEASON}` +
    `&from=2026-06-11&to=2026-07-19&count=200&language=en`;
  const fifaByTeams = new Map<string, { IdMatch: string; IdStage: string; Date: string }>();

  try {
    const res = await fetch(bulkUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const data: any = await res.json();
      const results: any[] = data?.Results ?? [];
      let withTeams = 0;
      for (const m of results) {
        if (!m?.IdMatch || !m?.Date) continue;
        const homeCode = normFifaCode(m?.Home?.IdCountry);
        const awayCode = normFifaCode(m?.Away?.IdCountry);
        if (homeCode && awayCode) {
          fifaByTeams.set(`${homeCode}:${awayCode}`, { IdMatch: m.IdMatch, IdStage: m.IdStage ?? '', Date: m.Date });
          fifaByTeams.set(`${awayCode}:${homeCode}`, { IdMatch: m.IdMatch, IdStage: m.IdStage ?? '', Date: m.Date });
          withTeams++;
        }
      }
      console.log(`  Got ${results.length} total matches, ${withTeams} with team codes.`);
    }
  } catch (err) {
    console.warn(`  Could not fetch bulk data: ${err}. Team-code matching will be skipped.`);
  }

  // Process R32 and R16 matches with team-code matching.
  for (const m of ourMatches) {
    if (!['r32', 'r16'].includes(m.round)) continue;

    const homeCode = m.homeTeamId ? (codeById.get(m.homeTeamId) ?? '') : '';
    const awayCode = m.awayTeamId ? (codeById.get(m.awayTeamId) ?? '') : '';
    const isTbd = !homeCode || !awayCode || homeCode === 'TBD' || awayCode === 'TBD';

    if (isTbd) {
      skipped++;
      continue;
    }

    const key = `${homeCode}:${awayCode}`;
    const fifaMatch = fifaByTeams.get(key);
    if (!fifaMatch) {
      console.log(`  · match=${m.matchNumber} (${m.round}) ${homeCode} vs ${awayCode} — no FIFA match`);
      skipped++;
      continue;
    }

    const ourTs = new Date(m.kickoffUtc).getTime();
    const fifaTs = new Date(fifaMatch.Date).getTime();
    if (Math.abs(ourTs - fifaTs) <= 60_000 && m.fifaIdMatch === fifaMatch.IdMatch) {
      unchanged++;
      continue;
    }

    teamCodeUpdatedIds.add(m.id);
    if (DRY_RUN) {
      console.log(`  [DRY] match=${m.matchNumber} (${m.round}) ${homeCode}v${awayCode} ${m.kickoffUtc} → ${fifaMatch.Date}`);
      updated++;
      continue;
    }

    await db.update(matches).set({
      kickoffUtc: fifaMatch.Date,
      predictionLockUtc: calcPredictionLock(fifaMatch.Date),
      fifaIdMatch: fifaMatch.IdMatch,
      fifaIdStage: fifaMatch.IdStage,
    }).where(eq(matches.id, m.id));

    console.log(`  match=${m.matchNumber} (${m.round}) ${homeCode}v${awayCode}: ${m.kickoffUtc} → ${fifaMatch.Date}`);
    updated++;
  }

  // 4. Positional matching for QF, SF, third, final (and R16/R32 fallback for TBD teams).
  // R32/R16 TBD matches that weren't matched by team code fall back to positional.
  // This is approximate but far more correct than the seed's July 4-12 placeholder dates.
  console.log('\nPositional matching for all rounds:');
  for (const round of ['r32', 'r16', 'qf', 'sf', 'third', 'final'] as const) {
    const fifaMs = positionalByRound.get(round);
    if (!fifaMs || fifaMs.length === 0) {
      console.log(`  ${round}: no FIFA matches found — skipping.`);
      continue;
    }

    // Skip matches already updated by team-code matching (avoid double-updating).
    const ourMs = ourMatches
      .filter((m) => m.round === round && !teamCodeUpdatedIds.has(m.id))
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());

    if (ourMs.length === 0) {
      console.log(`  ${round}: all matches already up-to-date.`);
      continue;
    }
    // For R32/R16 positional, we may have fewer FIFA matches than DB matches (TBD slots).
    // Only update the first min(fifa, ours) pairs.
    const pairCount = Math.min(fifaMs.length, ourMs.length);
    if (fifaMs.length !== ourMs.length) {
      const isExact = ['qf', 'sf', 'third', 'final'].includes(round);
      if (isExact) {
        console.warn(`  ${round}: count mismatch FIFA=${fifaMs.length} ours=${ourMs.length} — skipping.`);
        continue;
      }
      console.log(`  ${round}: FIFA=${fifaMs.length} available, ours=${ourMs.length} to update → pairing ${pairCount} positionally (${ourMs.length - pairCount} remain TBD).`);
    }

    for (let i = 0; i < pairCount; i++) {
      const our = ourMs[i];
      const fifa = fifaMs[i];

      const ourTs = new Date(our.kickoffUtc).getTime();
      const fifaTs = new Date(fifa.Date).getTime();
      const alreadyCorrect = Math.abs(ourTs - fifaTs) <= 60_000 && our.fifaIdMatch === fifa.IdMatch;

      if (alreadyCorrect) { unchanged++; continue; }

      if (DRY_RUN) {
        console.log(`  [DRY] match=${our.matchNumber} (${round}) ${our.kickoffUtc} → ${fifa.Date}`);
        updated++;
        continue;
      }

      await db
        .update(matches)
        .set({
          kickoffUtc: fifa.Date,
          predictionLockUtc: calcPredictionLock(fifa.Date),
          fifaIdMatch: fifa.IdMatch,
          fifaIdStage: fifa.IdStage,
        })
        .where(eq(matches.id, our.id));

      console.log(`  match=${our.matchNumber} (${round}) ${our.kickoffUtc} → ${fifa.Date}  IdMatch=${fifa.IdMatch}`);
      updated++;
    }
  }

  console.log(`\n[fix-knockout-dates] updated=${updated} unchanged=${unchanged} skipped=${skipped}`);
  if (skipped > 0) {
    console.log(`  ${skipped} TBD/unmatched matches skipped — re-run after group stage finishes (June 28).`);
  }
  if (DRY_RUN) console.log('  (DRY_RUN — no rows written)');
}

main().catch((err) => {
  console.error('[fix-knockout-dates] fatal:', err);
  process.exit(1);
});
