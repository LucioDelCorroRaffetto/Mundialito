import { Request, Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../../../db/index.js';
import { predictions, matches, teams } from '../../../db/schema/index.js';
import { ensurePersonalLeague } from '../../../lib/personal-league.js';

/**
 * Historial de pronósticos del usuario autenticado, para el perfil propio.
 *
 * Devuelve UNA fila por partido (no una por liga) tomando los pronósticos de
 * la liga personal del usuario — donde TODO pronóstico se propaga al crearse,
 * así que es la fuente canónica del "qué pronostiqué" sin la divergencia
 * por-liga. Cada fila viene enriquecida con los datos del partido (equipos,
 * marcador real, estado) necesarios para renderizar el historial.
 *
 * CRÍTICO: solo se incluyen partidos que YA EMPEZARON. El filtro usa el mismo
 * criterio canónico que match-predictions.ts: status 'live'/'finished' O bien
 * kickoffUtc <= ahora (fallback por si el sync todavía no flipeó el status).
 * Los partidos futuros NUNCA se exponen acá.
 */
export async function myPredictionHistoryHandler(req: Request, res: Response) {
  const userId = req.user!.id;

  // Liga personal: siempre existe (se auto-sana si faltara). Es la única liga
  // en la que garantizamos exactamente un pronóstico por match.
  const personalLeagueId = await ensurePersonalLeague(userId);

  const homeTeam = alias(teams, 'home_team');
  const awayTeam = alias(teams, 'away_team');

  const rows = await db
    .select({
      predictionId: predictions.id,
      matchId: matches.id,
      matchNumber: matches.matchNumber,
      kickoffUtc: matches.kickoffUtc,
      status: matches.status,
      round: matches.round,
      group: matches.group,
      actualHomeScore: matches.homeScore,
      actualAwayScore: matches.awayScore,
      predictedHomeScore: predictions.homeScore,
      predictedAwayScore: predictions.awayScore,
      points: predictions.points,
      homeTeamId: homeTeam.id,
      homeTeamName: homeTeam.name,
      homeTeamCode: homeTeam.code,
      homeTeamFlag: homeTeam.flag,
      awayTeamId: awayTeam.id,
      awayTeamName: awayTeam.name,
      awayTeamCode: awayTeam.code,
      awayTeamFlag: awayTeam.flag,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .leftJoin(homeTeam, eq(matches.homeTeamId, homeTeam.id))
    .leftJoin(awayTeam, eq(matches.awayTeamId, awayTeam.id))
    .where(
      and(
        eq(predictions.userId, userId),
        eq(predictions.leagueId, personalLeagueId),
      ),
    )
    .orderBy(desc(matches.kickoffUtc));

  const now = Date.now();
  // Filtro "ya empezó" — criterio canónico (ver match-predictions.ts:37-42).
  const started = rows.filter(
    (r) =>
      r.status === 'live' ||
      r.status === 'finished' ||
      new Date(r.kickoffUtc).getTime() <= now,
  );

  return res.json({ data: started, meta: { total: started.length } });
}
