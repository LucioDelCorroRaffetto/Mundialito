/**
 * Maps our matches.id to API-Football's fixture.id so the per-player stats
 * sync can request `/fixtures/players?fixture={id}` directly.
 *
 * Run once before the tournament starts. Uses 1 API request to list all
 * WC fixtures, then matches by kickoff time (±15 min) and at least one of
 * the team-name normalisations (case-insensitive, accent-stripped).
 *
 *   pnpm --filter @mundialito/api exec tsx src/scripts/backfill-api-fixture-ids.ts
 *
 * Required env: API_FOOTBALL_KEY
 * Optional env: API_FOOTBALL_LEAGUE_ID (default 1), API_FOOTBALL_SEASON
 *               (default 2026), DRY_RUN=1 to preview without writing.
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, teams } from '../db/schema/index.js';

const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY ?? '';
const LEAGUE_ID = Number(process.env.API_FOOTBALL_LEAGUE_ID ?? '1');
const SEASON = Number(process.env.API_FOOTBALL_SEASON ?? '2026');
const DRY_RUN = process.env.DRY_RUN === '1';

interface FixtureRow {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
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

function teamsMatch(apiName: string, ourName: string): boolean {
  const a = norm(apiName);
  const b = norm(ourName);
  return a === b || a.includes(b) || b.includes(a);
}

async function main() {
  if (!API_KEY) {
    console.error('API_FOOTBALL_KEY is not set — abort.');
    process.exit(1);
  }
  console.log(
    `[backfill-api-fixture-ids] league=${LEAGUE_ID} season=${SEASON} dryRun=${DRY_RUN}`,
  );

  // 1. Fetch all WC fixtures from API-Football (single request).
  const url = `${BASE_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`;
  const res = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  });
  if (!res.ok) {
    console.error(`API-Football returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { response: FixtureRow[]; errors: unknown };
  const fixtures = data.response ?? [];
  console.log(`  Got ${fixtures.length} fixtures from API-Football`);
  if (fixtures.length === 0) {
    console.warn('  Nothing to map. Check league/season env vars.');
    return;
  }

  // 2. Load our matches + team names.
  const ourMatches = await db
    .select({
      id: matches.id,
      kickoffUtc: matches.kickoffUtc,
      apiFixtureId: matches.apiFixtureId,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches);
  const teamIds = ourMatches
    .flatMap((m) => [m.homeTeamId, m.awayTeamId])
    .filter((id): id is number => id != null);
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, teamIds));
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

  // 3. Match each of our matches to a fixture.
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  let mapped = 0;
  let skippedAlreadyMapped = 0;
  let unmatched = 0;

  for (const m of ourMatches) {
    if (m.apiFixtureId != null) {
      skippedAlreadyMapped++;
      continue;
    }
    const ourHomeName = m.homeTeamId != null ? teamNameById.get(m.homeTeamId) ?? '' : '';
    const ourAwayName = m.awayTeamId != null ? teamNameById.get(m.awayTeamId) ?? '' : '';
    const ourTime = new Date(m.kickoffUtc).getTime();

    const candidate = fixtures.find((f) => {
      const diff = Math.abs(new Date(f.fixture.date).getTime() - ourTime);
      if (diff > FIFTEEN_MIN_MS) return false;
      return (
        teamsMatch(f.teams.home.name, ourHomeName) &&
        teamsMatch(f.teams.away.name, ourAwayName)
      );
    });

    if (!candidate) {
      unmatched++;
      console.log(
        `  · matchId=${m.id} ${ourHomeName} vs ${ourAwayName} @ ${m.kickoffUtc} — no API-Football match`,
      );
      continue;
    }

    if (!DRY_RUN) {
      await db
        .update(matches)
        .set({ apiFixtureId: candidate.fixture.id })
        .where(eq(matches.id, m.id));
    }
    mapped++;
    console.log(
      `  ✓ matchId=${m.id} → fixtureId=${candidate.fixture.id} (${candidate.teams.home.name} vs ${candidate.teams.away.name})`,
    );
  }

  console.log(
    `\n[backfill-api-fixture-ids] mapped=${mapped} already=${skippedAlreadyMapped} unmatched=${unmatched}`,
  );
  if (DRY_RUN) console.log('  (DRY_RUN — no rows written)');
}

main().catch((err) => {
  console.error('[backfill-api-fixture-ids] failed:', err);
  process.exit(1);
});
