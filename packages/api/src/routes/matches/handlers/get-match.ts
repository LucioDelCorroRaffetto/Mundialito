import { Request, Response } from 'express';
import { eq, and, gt, or } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { matches, playerMatchStats, players, teams } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

export async function getMatchHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new NotFoundError('Match');

  const match = await db.select().from(matches).where(eq(matches.id, id)).get();
  if (!match) throw new NotFoundError('Match');

  // Eventos del partido — goles, asistencias, amarillas, rojas — para
  // que la pantalla de detalle pueda armar el timeline aunque sea sin
  // minutos exactos (FIFA timeline no expone tiempo en el stat agregado).
  // Cada fila representa un jugador con sus contadores acumulados.
  const stats = await db
    .select({
      playerId: playerMatchStats.playerId,
      playerName: players.name,
      teamId: players.teamId,
      teamCode: teams.code,
      goals: playerMatchStats.goals,
      assists: playerMatchStats.assists,
      yellowCards: playerMatchStats.yellowCards,
      redCard: playerMatchStats.redCard,
      shirtNumber: players.shirtNumber,
    })
    .from(playerMatchStats)
    .innerJoin(players, eq(playerMatchStats.playerId, players.id))
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(
      and(
        eq(playerMatchStats.matchId, id),
        or(
          gt(playerMatchStats.goals, 0),
          gt(playerMatchStats.assists, 0),
          gt(playerMatchStats.yellowCards, 0),
          eq(playerMatchStats.redCard, true),
        ),
      ),
    );

  return res.json({ ...match, events: stats });
}
