import { Request, Response } from 'express';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { playerMatchStats, players, teams } from '../../../db/schema/index.js';

/**
 * GET /stats/leaderboards
 * Devuelve cuatro tablas en una sola call:
 *   - topScorers   (goles)
 *   - topAssists   (asistencias)
 *   - topYellows   (amarillas acumuladas)
 *   - topReds      (rojas acumuladas)
 *
 * Se agrupa por jugador sumando todos los partidos. Si un jugador no
 * aparece en player_match_stats todavía, queda fuera (no inflamos con 0s).
 * NO truncamos la tabla: se devuelven TODOS los jugadores con total > 0.
 * Antes había un cap de 50 que dejaba goleadores afuera una vez que el
 * torneo acumulaba marcadores (mismo bug que ya se corrigió en
 * list-players.ts, donde el cap de 50 truncaba el roster).
 *
 * Tie-breaker: el orden secundario por nombre asegura que dos corridas
 * consecutivas devuelvan las filas en el mismo orden. Sin esto, el
 * SQLite no garantiza orden entre filas con igual `total` (típico:
 * desfase de fase de grupos con 20+ jugadores empatados a 1 gol).
 *
 * No requiere auth — son datos públicos del torneo. La lectura es barata
 * y la cache de tanstack-query en el cliente se encarga del resto.
 */
export async function getLeaderboardsHandler(_req: Request, res: Response) {
  async function topBy(
    metric: 'goals' | 'assists' | 'yellow_cards' | 'red_card',
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
      .orderBy(desc(valueExpr), asc(players.name));

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
