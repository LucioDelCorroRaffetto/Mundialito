/**
 * Auditoría stats: para cada partido finished, compara goles/amarillas/rojas
 * del feed FIFA contra lo guardado en player_match_stats. Detecta:
 *   - goles del feed que no se atribuyeron a ningún jugador
 *   - eventos atribuidos pero ausentes en el feed (no debería pasar)
 *   - jugadores con position='GK' que figuran como goleadores (sanity)
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { matches, players, teams, playerMatchStats } from '../db/schema/index.js';

const GOAL_TYPES = new Set([0, 39, 41]);
const OWN_GOAL_TYPES = new Set([34]);
const YELLOW = 2;
const RED = 3;

async function main() {
  const finished = await db
    .select({ id: matches.id, n: matches.matchNumber, home: matches.homeScore, away: matches.awayScore, fifaStage: matches.fifaIdStage, fifaMatch: matches.fifaIdMatch, homeTeamId: matches.homeTeamId, awayTeamId: matches.awayTeamId })
    .from(matches)
    .where(eq(matches.status, 'finished'));

  for (const m of finished) {
    if (!m.fifaMatch || !m.fifaStage) continue;
    const url = `https://api.fifa.com/api/v3/timelines/17/285023/${m.fifaStage}/${m.fifaMatch}?language=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      console.log(`#${m.n} HTTP ${res.status}`);
      continue;
    }
    const data: any = await res.json();
    const evs = (data.Event ?? []) as any[];
    const feedGoals = evs.filter((e) => GOAL_TYPES.has(e.Type)).length;
    const feedOG = evs.filter((e) => OWN_GOAL_TYPES.has(e.Type)).length;
    const feedYellow = evs.filter((e) => e.Type === YELLOW).length;
    const feedRed = evs.filter((e) => e.Type === RED).length;

    const stats = await db
      .select({ goals: sql<number>`sum(${playerMatchStats.goals})`, yellows: sql<number>`sum(${playerMatchStats.yellowCards})`, reds: sql<number>`sum(case when ${playerMatchStats.redCard} then 1 else 0 end)` })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, m.id))
      .get();

    const dbGoals = stats?.goals ?? 0;
    const dbY = stats?.yellows ?? 0;
    const dbR = stats?.reds ?? 0;

    // Total score from matches table should equal sum of goal events
    // (regular goals + own goals BOTH increment the team score, but only
    // regular goals add to a player's `goals` bucket).
    const expectedTotalScore = (m.home ?? 0) + (m.away ?? 0);
    const goalDelta = feedGoals + feedOG - expectedTotalScore;

    const issues: string[] = [];
    if (feedGoals > dbGoals) issues.push(`MISSING_GOALS feed=${feedGoals} db=${dbGoals} → ${feedGoals - dbGoals} unattributed`);
    if (dbGoals > feedGoals) issues.push(`EXTRA_GOALS db=${dbGoals} feed=${feedGoals}`);
    if (feedYellow !== dbY) issues.push(`YELLOWS feed=${feedYellow} db=${dbY}`);
    if (feedRed !== dbR) issues.push(`REDS feed=${feedRed} db=${dbR}`);
    if (goalDelta !== 0) issues.push(`SCORE_MISMATCH match.score=${expectedTotalScore} but feed had ${feedGoals + feedOG} (goals+OG)`);

    const flag = issues.length ? '❌' : '✅';
    console.log(`${flag} #${String(m.n).padStart(2)} score=${m.home}-${m.away}  feed: G=${feedGoals} OG=${feedOG} Y=${feedYellow} R=${feedRed}  db: G=${dbGoals} Y=${dbY} R=${dbR}  ${issues.join('; ')}`);
  }

  // Sanity: anyone listed as GK with goals > 0?
  console.log('\n--- GKs with goals (suspicious) ---');
  const gkScorers = await db
    .select({ name: players.name, team: teams.code, goals: sql<number>`sum(${playerMatchStats.goals})` })
    .from(playerMatchStats)
    .innerJoin(players, eq(playerMatchStats.playerId, players.id))
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(eq(players.position, 'GK'))
    .groupBy(playerMatchStats.playerId)
    .having(sql`sum(${playerMatchStats.goals}) > 0`);
  if (gkScorers.length === 0) console.log('  (none)');
  for (const r of gkScorers) console.log(`  ${r.name} (${r.team}) goals=${r.goals}`);
}

main().catch(console.error);
