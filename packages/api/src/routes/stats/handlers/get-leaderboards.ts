import { Request, Response } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { playerMatchStats, players, teams } from '../../../db/schema/index.js';

/**
 * GET /stats/leaderboards
 * Devuelve cuatro tablas en una sola call:
 *   - topScorers   (goles, top 20)
 *   - topAssists   (asistencias, top 20)
 *   - topYellows   (amarillas acumuladas, top 20)
 *   - topReds      (rojas acumuladas, top 20)
 *
 * Se agrupa por jugador sumando todos los partidos. Si un jugador no
 * aparece en player_match_stats todavía, queda fuera (no inflamos con 0s).
 *
 * No requiere auth — son datos públicos del torneo. La lectura es barata
 * y la cache de tanstack-query en el cliente se encarga del resto.
 */
export async function getLeaderboardsHandler(_req: Request, res: Response) {
  // Sub-query agrupada por jugador. Un solo barrido a player_match_stats
  // por endpoint — cuatro selects independientes leen del mismo origen
  // físico (SQLite, índice en match_id+player_id) y son sub-milisegundos.
  async function topBy(
    metric: 'goals' | 'assists' | 'yellow_cards' | 'red_card',
    limit = 20,
  ) {
    // `red_card` es boolean en el schema — sum(1) cuando es true.
    const valueExpr =
      metric === 'red_card'
        ? sql<number>`sum(case when ${playerMatchStats.redCard} then 1 else 0 end)`
        : metric === 'yellow_cards'
          ? sql<number>`sum(${playerMatchStats.yellowCards})`
          : metric === 'assists'
            ? sql<number>`sum(${playerMatchStats.assists})`
            : sql<number>`sum(${playerMatchStats.goals})`;

    const rows = await db
      .select({
        playerId: playerMatchStats.playerId,
        playerName: players.name,
        position: players.position,
        photoUrl: players.photoUrl,
        teamId: players.teamId,
        teamCode: teams.code,
        teamFlag: teams.flag,
        teamName: teams.name,
        total: valueExpr,
      })
      .from(playerMatchStats)
      .innerJoin(players, eq(playerMatchStats.playerId, players.id))
      .innerJoin(teams, eq(players.teamId, teams.id))
      .groupBy(playerMatchStats.playerId)
      .having(sql`${valueExpr} > 0`)
      .orderBy(desc(valueExpr))
      .limit(limit);

    return rows;
  }

  const [topScorers, topAssists, topYellows, topReds] = await Promise.all([
    topBy('goals'),
    topBy('assists'),
    topBy('yellow_cards'),
    topBy('red_card'),
  ]);

  return res.json({
    data: { topScorers, topAssists, topYellows, topReds },
  });
}
