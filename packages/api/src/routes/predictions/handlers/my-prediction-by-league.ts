import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { predictions, leagues, leagueMembers } from '../../../db/schema/index.js';
import { NotFoundError } from '../../../lib/errors.js';

/**
 * GET /predictions/match/:matchId/mine-by-league
 * Devuelve un pronóstico por cada liga (no personal) a la que pertenece el
 * usuario para ese partido. Si el usuario nunca guardó para una liga, la
 * incluye igual con scores null — así el cliente puede mostrar "todavía sin
 * pronóstico" en esa liga.
 *
 * Used por la vista divergente del match-detail: si el usuario tiene
 * marcadores distintos en distintas ligas, mostramos un mini-listado.
 */
export async function myPredictionByLeagueHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    throw new NotFoundError('Prediction');
  }

  // Trae todas las ligas del usuario (filtrando las personal/auto). El UI
  // las usa además para el chip selector, así que devolver el nombre evita
  // un fetch extra.
  const userLeagues = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      isPersonal: leagues.isPersonal,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId));

  const visibleLeagues = userLeagues.filter((l) => !l.isPersonal);

  // Trae todas las predicciones del usuario para ese match en una sola
  // query — match-userId tiene índice, así que una sola pasada para todas
  // las ligas. Indexamos por leagueId en memoria.
  const rows = await db
    .select({
      leagueId: predictions.leagueId,
      homeScore: predictions.homeScore,
      awayScore: predictions.awayScore,
      points: predictions.points,
    })
    .from(predictions)
    .where(and(eq(predictions.userId, userId), eq(predictions.matchId, matchId)));

  const byLeague = new Map<number, (typeof rows)[number]>();
  for (const r of rows) byLeague.set(r.leagueId, r);

  const data = visibleLeagues.map((l) => {
    const p = byLeague.get(l.id);
    return {
      leagueId: l.id,
      leagueName: l.name,
      homeScore: p?.homeScore ?? null,
      awayScore: p?.awayScore ?? null,
      points: p?.points ?? null,
    };
  });

  return res.json({ data });
}
