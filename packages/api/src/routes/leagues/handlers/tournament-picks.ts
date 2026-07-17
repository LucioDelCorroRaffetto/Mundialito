/**
 * GET /leagues/:id/tournament-predictions
 *
 * Picks de Copa (campeón, goleador, sorpresa, etc.) de TODOS los miembros de
 * la liga, para transparencia: las predicciones de Copa son POR LIGA (un user
 * puede elegir distinto en cada una), así que se muestran acá y no en el
 * perfil global.
 *
 * Anti-copia: antes del lock (lib/tournament-lock.ts) solo se devuelve la
 * fila propia. Después del lock (desde el 19/6) se ven todas. `points` viene
 * null hasta que el resolver corra tras la final.
 */
import { Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { leagueMembers, tournamentPredictions, users, players } from '../../../db/schema/index.js';
import { NotFoundError, AppError } from '../../../lib/errors.js';
import { isTournamentPredictionsLocked } from '../../../lib/tournament-lock.js';

export async function leagueTournamentPicksHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const leagueId = Number(req.params.id);
  if (!Number.isInteger(leagueId)) throw new NotFoundError('League');

  const membership = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .get();
  if (!membership) throw new AppError('FORBIDDEN', 'Not a member of this league', 403);

  const locked = isTournamentPredictionsLocked();

  const rows = await db
    .select({
      userId: tournamentPredictions.userId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      championTeamId: tournamentPredictions.championTeamId,
      runnerUpTeamId: tournamentPredictions.runnerUpTeamId,
      thirdPlaceTeamId: tournamentPredictions.thirdPlaceTeamId,
      topScorerPlayerId: tournamentPredictions.topScorerPlayerId,
      revelationTeamId: tournamentPredictions.revelationTeamId,
      surpriseEliminatedTeamId: tournamentPredictions.surpriseEliminatedTeamId,
      bestDefenseTeamId: tournamentPredictions.bestDefenseTeamId,
      points: tournamentPredictions.points,
    })
    .from(tournamentPredictions)
    .innerJoin(users, eq(tournamentPredictions.userId, users.id))
    .where(
      locked
        ? eq(tournamentPredictions.leagueId, leagueId)
        : and(eq(tournamentPredictions.leagueId, leagueId), eq(tournamentPredictions.userId, userId)),
    );

  // Nombre del goleador elegido resuelto server-side: evita que el front baje
  // el catálogo completo de jugadores solo para esta sección.
  const scorerIds = [...new Set(rows.map((r) => r.topScorerPlayerId).filter((v): v is number => v != null))];
  const scorerRows = scorerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, scorerIds))
    : [];
  const scorerNameById = new Map(scorerRows.map((p) => [p.id, p.name]));

  const data = rows
    .map((r) => ({
      ...r,
      topScorerName: r.topScorerPlayerId != null ? scorerNameById.get(r.topScorerPlayerId) ?? null : null,
    }))
    // Orden estable: más puntos primero (post-resolución), después alfabético.
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.username.localeCompare(b.username));

  return res.json({ data, meta: { total: data.length, locked } });
}
