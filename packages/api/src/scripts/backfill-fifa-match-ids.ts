/**
 * Maps our `matches.id` to the FIFA.com `IdMatch` + `IdStage` so the
 * timeline endpoint can be hit during the tournament. One-shot, idempotent.
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/backfill-fifa-match-ids.ts
 *
 * `DRY_RUN=1` to preview without writing.
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, teams } from '../db/schema/index.js';

const FIFA_COMPETITION_ID = '17';
const FIFA_SEASON_ID = '285023'; // WC 2026
const DRY_RUN = process.env.DRY_RUN === '1';

interface FifaLocaleString { Locale: string; Description: string }
interface FifaTeam {
  IdTeam: string;
  IdCountry?: string;
  TeamName?: FifaLocaleString[];
}
interface FifaCalendarMatch {
  IdMatch: string;
  IdStage: string;
  Date: string;
  Home: FifaTeam | null;
  Away: FifaTeam | null;
}

/**
 * FIFA's 3-letter country code → our `teams.code`. Most are identical (MEX,
 * KOR, CZE, …); the handful of exceptions live here. Add entries when the
 * dry-run reports unmatched groupes.
 */
const FIFA_CODE_TO_OURS: Record<string, string> = {
  RSA: 'ZAF',  // South Africa
};

function normalizeFifaCode(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  return FIFA_CODE_TO_OURS[upper] ?? upper;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`´ʹ]/g, '')
    .replace(/[.,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const A = norm(a);
  const B = norm(b);
  if (A === B) return true;
  if (A.length >= 6 && B.length >= 6) return A.includes(B) || B.includes(A);
  return false;
}

async function main() {
  console.log(`[backfill-fifa-match-ids] WC ${FIFA_COMPETITION_ID}/${FIFA_SEASON_ID} dryRun=${DRY_RUN}`);

  // 1. Fetch the whole WC calendar.
  const url = `https://api.fifa.com/api/v3/calendar/matches?idCompetition=${FIFA_COMPETITION_ID}&idSeason=${FIFA_SEASON_ID}&from=2026-06-11&to=2026-07-19&count=100&language=en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    console.error(`FIFA returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { Results: FifaCalendarMatch[] };
  const fixtures = data.Results ?? [];
  console.log(`  Got ${fixtures.length} fixtures from FIFA.com`);
  if (fixtures.length === 0) {
    console.error('  ✗ Zero fixtures. Check FIFA_SEASON_ID.');
    process.exit(1);
  }
  if (fixtures.length < 40) {
    console.error(`  ✗ Only ${fixtures.length} fixtures, too few for the WC. Aborting.`);
    process.exit(1);
  }
  // FIFA's calendar endpoint sometimes returns play-off fixtures alongside
  // the actual tournament matches (we saw 100 = 64 WC + ~36 intercontinental
  // play-offs). That's fine — the per-match kickoff+teams filter discards
  // anything that isn't in our DB.

  // 2. Load our matches + team codes (preferred for matching) + names (fallback).
  const ourMatches = await db
    .select({
      id: matches.id,
      kickoffUtc: matches.kickoffUtc,
      fifaIdMatch: matches.fifaIdMatch,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches);
  const teamIds = ourMatches
    .flatMap((m) => [m.homeTeamId, m.awayTeamId])
    .filter((id): id is number => id != null);
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, code: teams.code })
    .from(teams)
    .where(inArray(teams.id, teamIds));
  const nameById = new Map(teamRows.map((t) => [t.id, t.name]));
  const codeById = new Map(teamRows.map((t) => [t.id, t.code.toUpperCase()]));

  // 3. Match each of our rows against the FIFA list.
  //
  // Note on times: FIFA's authoritative schedule frequently differs from ours
  // by several hours (FIFA tends to publish UTC kickoffs we estimated wrong
  // in the seed). When the two team codes match exactly, the SAME CALENDAR
  // DAY is enough to identify the fixture — no two matches of the same pair
  // can happen on the same day. We still use kickoff distance as a tie-
  // breaker when the day has multiple candidates (extremely rare).
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  let mapped = 0;
  let skipped = 0;
  let unmatched = 0;
  let ambiguous = 0;

  for (const m of ourMatches) {
    if (m.fifaIdMatch) {
      skipped++;
      continue;
    }
    const home = m.homeTeamId != null ? nameById.get(m.homeTeamId) ?? '' : '';
    const away = m.awayTeamId != null ? nameById.get(m.awayTeamId) ?? '' : '';
    const homeCode = m.homeTeamId != null ? codeById.get(m.homeTeamId) ?? '' : '';
    const awayCode = m.awayTeamId != null ? codeById.get(m.awayTeamId) ?? '' : '';
    const t = new Date(m.kickoffUtc).getTime();

    const cands = fixtures.filter((f) => {
      // Same-day filter (tolerant of hour drift FIFA introduces).
      const diff = Math.abs(new Date(f.Date).getTime() - t);
      if (diff > ONE_DAY_MS) return false;
      const fHomeCode = normalizeFifaCode(f.Home?.IdCountry);
      const fAwayCode = normalizeFifaCode(f.Away?.IdCountry);
      // 3-letter codes are the reliable match key (FIFA names are in English,
      // ours in Spanish). Knockouts may flip home/away — accept both orders.
      if (homeCode && awayCode && fHomeCode && fAwayCode) {
        if ((fHomeCode === homeCode && fAwayCode === awayCode) ||
            (fHomeCode === awayCode && fAwayCode === homeCode)) {
          return true;
        }
      }
      // Fallback to fuzzy name match (covers FIFA payloads with missing
      // IdCountry, e.g. play-off slot placeholders).
      const fHome = f.Home?.TeamName?.[0]?.Description ?? '';
      const fAway = f.Away?.TeamName?.[0]?.Description ?? '';
      return (
        (teamsMatch(fHome, home) && teamsMatch(fAway, away)) ||
        (teamsMatch(fHome, away) && teamsMatch(fAway, home))
      );
    });

    if (cands.length === 0) {
      unmatched++;
      console.log(`  · matchId=${m.id} ${home} vs ${away} @ ${m.kickoffUtc} — no FIFA match`);
      continue;
    }
    if (cands.length > 1) {
      ambiguous++;
      console.warn(
        `  ⚠ matchId=${m.id} ${home} vs ${away} — ${cands.length} candidates: ${
          cands.map((c) => `#${c.IdMatch}`).join(', ')
        }`,
      );
      continue;
    }
    const winner = cands[0];

    if (!DRY_RUN) {
      await db
        .update(matches)
        .set({ fifaIdMatch: winner.IdMatch, fifaIdStage: winner.IdStage })
        .where(eq(matches.id, m.id));
    }
    mapped++;
    console.log(
      `  ✓ matchId=${m.id} → IdMatch=${winner.IdMatch} IdStage=${winner.IdStage} (${winner.Home?.TeamName?.[0]?.Description} vs ${winner.Away?.TeamName?.[0]?.Description})`,
    );
  }

  console.log(
    `\n[backfill-fifa-match-ids] mapped=${mapped} skipped=${skipped} unmatched=${unmatched} ambiguous=${ambiguous}`,
  );
  if (DRY_RUN) console.log('  (DRY_RUN — no rows written)');
}

main().catch((err) => {
  console.error('[backfill-fifa-match-ids] failed:', err);
  process.exit(1);
});
