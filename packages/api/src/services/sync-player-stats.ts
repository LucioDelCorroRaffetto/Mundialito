/**
 * Syncs per-player stats (goals, assists, cards, played) from API-Football
 * into our `player_match_stats` table for a given match, then triggers a
 * fantasy recompute so the standings reflect the new data within seconds.
 *
 * Free-tier note: API-Football allows 100 requests/day on the free plan.
 * A whole World Cup has 64 matches, so syncing every match exactly once
 * (32 requests for fixtures listing + 64 for player stats = 96) still fits.
 * The `live polling` loop is intentionally NOT here — this is one-shot,
 * triggered when a match flips to `finished`.
 *
 * The function is a no-op (returns 0) when:
 *   - API_FOOTBALL_KEY is not set,
 *   - the match has no `apiFixtureId` mapped yet (run the backfill script),
 *   - the match isn't in the `finished` status,
 *   - the upstream response is empty.
 *
 * Player matching: API-Football names are matched against our DB by
 * (teamId, normalized name). The team is known from the fixture (home/away
 * map to our home_team_id / away_team_id). Name normalization strips
 * accents, lowercases, and removes punctuation so "M'Bappé" matches
 * "Mbappe", etc.
 */
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, players, playerMatchStats, teams } from '../db/schema/index.js';
import { recomputeAllFantasyPoints } from './fantasy-scoring-service.js';

const BASE_URL = 'https://v3.football.api-sports.io';

interface ApiFootballResponse<T> {
  response: T[];
  errors: Record<string, string> | unknown[];
  results: number;
}

interface PlayerStatsBlock {
  team: { id: number; name: string };
  players: Array<{
    player: { id: number; name: string };
    statistics?: Array<{
      games?: {
        minutes?: number | null;
        position?: string | null;
        number?: number | null;
        rating?: string | null;
      };
      goals?: { total?: number | null; assists?: number | null };
      cards?: { yellow?: number | null; red?: number | null };
    }>;
  }>;
}

export interface SyncStatsResult {
  matched: number;
  unmatched: string[];
  upserted: number;
  skipped?: string;
}

/**
 * Strips accents, lowercases, removes apostrophes/punctuation and collapses
 * whitespace so "M'Bappé Lottin", "Mbappe Lottin" and "  mbappe lottin "
 * all reduce to the same key.
 */
function normName(s: string): string {
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

function looksLikeMatch(apiName: string, dbName: string): boolean {
  const a = normName(apiName);
  const d = normName(dbName);
  if (a === d) return true;
  // Last-name + first-initial heuristic: handles "L. Messi" vs "Lionel Messi".
  const aTokens = a.split(' ');
  const dTokens = d.split(' ');
  if (aTokens.length === 0 || dTokens.length === 0) return false;
  const aLast = aTokens[aTokens.length - 1];
  const dLast = dTokens[dTokens.length - 1];
  if (aLast !== dLast) return false;
  // Same last name + either first names equal OR one of them is a single
  // initial that matches the first letter of the other.
  const aFirst = aTokens[0];
  const dFirst = dTokens[0];
  if (aFirst === dFirst) return true;
  if (aFirst.length === 1 && dFirst.startsWith(aFirst)) return true;
  if (dFirst.length === 1 && aFirst.startsWith(dFirst)) return true;
  return false;
}

export async function syncPlayerStatsForMatch(matchId: number): Promise<SyncStatsResult> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'API_FOOTBALL_KEY not set' };
  }

  // Load the match + apiFixtureId.
  const m = await db
    .select({
      id: matches.id,
      apiFixtureId: matches.apiFixtureId,
      status: matches.status,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .get();
  if (!m) return { matched: 0, unmatched: [], upserted: 0, skipped: 'match not found' };
  if (m.apiFixtureId == null) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'apiFixtureId not mapped — run backfill' };
  }
  if (m.status !== 'finished') {
    return { matched: 0, unmatched: [], upserted: 0, skipped: `match status is ${m.status}` };
  }

  // Fetch player stats from API-Football.
  const url = `${BASE_URL}/fixtures/players?fixture=${m.apiFixtureId}`;
  const res = await fetch(url, {
    headers: {
      'x-apisports-key': apiKey,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  });
  if (!res.ok) {
    throw new Error(`API-Football fixtures/players returned ${res.status}`);
  }
  const data = (await res.json()) as ApiFootballResponse<PlayerStatsBlock>;
  if (Array.isArray(data.errors) ? false : Object.keys(data.errors ?? {}).length > 0) {
    throw new Error(`API-Football errors: ${JSON.stringify(data.errors)}`);
  }
  if (!data.response || data.response.length === 0) {
    return { matched: 0, unmatched: [], upserted: 0, skipped: 'empty response' };
  }

  // Pull our DB roster for home + away so the fuzzy matcher only ever has to
  // consider ~26 names per side.
  const teamIds = [m.homeTeamId, m.awayTeamId].filter((id): id is number => id != null);
  const dbPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      teamId: players.teamId,
    })
    .from(players)
    .where(inArray(players.teamId, teamIds));
  const dbPlayersByTeam = new Map<number, Array<{ id: number; name: string }>>();
  for (const p of dbPlayers) {
    const list = dbPlayersByTeam.get(p.teamId) ?? [];
    list.push({ id: p.id, name: p.name });
    dbPlayersByTeam.set(p.teamId, list);
  }

  // The two `team` blocks come back as API-Football team IDs, which we
  // don't store. Match them to our home/away by team-name (loose) against
  // our `teams.name`.
  const ourTeams = await db
    .select({ id: teams.id, name: teams.name, code: teams.code })
    .from(teams)
    .where(inArray(teams.id, teamIds));
  const ourTeamByNorm = new Map(
    ourTeams.map((t) => [normName(t.name), t.id] as const),
  );

  let matched = 0;
  let upserted = 0;
  const unmatched: string[] = [];

  for (const block of data.response) {
    const apiTeamNorm = normName(block.team.name);
    const ourTeamId = ourTeamByNorm.get(apiTeamNorm)
      // Loose: contains-each-other so "Estados Unidos" vs "USA" doesn't fail
      // outright. Falls back to either home or away if no match — we already
      // restricted teamIds to this fixture so picking the wrong one is
      // benign here.
      ?? ourTeams.find((t) =>
        normName(t.name).includes(apiTeamNorm) || apiTeamNorm.includes(normName(t.name)),
      )?.id;
    if (ourTeamId == null) {
      unmatched.push(`team:${block.team.name}`);
      continue;
    }

    const roster = dbPlayersByTeam.get(ourTeamId) ?? [];
    for (const ap of block.players) {
      const dbPlayer = roster.find((p) => looksLikeMatch(ap.player.name, p.name));
      if (!dbPlayer) {
        unmatched.push(`${block.team.name}:${ap.player.name}`);
        continue;
      }
      matched++;

      // Aggregate when API-Football returns multiple `statistics` rows for
      // the same player (rare, but defensive).
      let minutes = 0;
      let goals = 0;
      let assists = 0;
      let yellow = 0;
      let red = 0;
      for (const stat of ap.statistics ?? []) {
        minutes += stat.games?.minutes ?? 0;
        goals += stat.goals?.total ?? 0;
        assists += stat.goals?.assists ?? 0;
        yellow += stat.cards?.yellow ?? 0;
        red += stat.cards?.red ?? 0;
      }

      await db
        .insert(playerMatchStats)
        .values({
          matchId,
          playerId: dbPlayer.id,
          played: minutes > 0,
          goals,
          assists,
          // Our schema caps yellowCards at 2; clamp to be safe.
          yellowCards: Math.min(2, yellow),
          redCard: red > 0,
        })
        .onConflictDoUpdate({
          target: [playerMatchStats.matchId, playerMatchStats.playerId],
          set: {
            played: minutes > 0,
            goals,
            assists,
            yellowCards: Math.min(2, yellow),
            redCard: red > 0,
          },
        });
      upserted++;
    }
  }

  if (upserted > 0) {
    try {
      await recomputeAllFantasyPoints();
    } catch (err) {
      console.error('[sync-player-stats] fantasy recompute failed:', err);
    }
  }

  // Silence the unused-import warning when `sql` isn't needed here. Kept
  // around in case future versions use raw SQL in the upsert payload.
  void sql;
  void and;

  return { matched, unmatched, upserted };
}
