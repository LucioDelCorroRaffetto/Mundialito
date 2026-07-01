import { Request, Response } from 'express';
import { and, eq, or, lte, desc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../../../db/index.js';
import { predictions, matches, teams, users } from '../../../db/schema/index.js';
import { AppError, NotFoundError } from '../../../lib/errors.js';
import { regulationScore } from '../../../lib/score-sync.js';

/**
 * GET /predictions/user/:userId/history
 *
 * Devuelve el historial de pronósticos de OTRO usuario para mostrarlo en su
 * perfil público.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SEGURIDAD (lo más importante de este handler)
 * ────────────────────────────────────────────────────────────────────────
 * JAMÁS se puede exponer el pronóstico de otro usuario para un partido que
 * todavía no arrancó: si se filtra, la gente lo copia y se rompe el juego.
 *
 * El gate vive EN EL SERVER, no en el cliente. La query SQL solo trae filas
 * cuyo partido ya arrancó. El criterio de "arrancó" replica el canónico de
 * match-predictions.ts (status live/finished/suspended O kickoff <= now),
 * calculado con un `now` del servidor (NUNCA un valor del cliente):
 *
 *     matchStarted = status IN ('live','finished','suspended')
 *                    OR kickoffUtc <= nowIso
 *
 * Notas:
 *  - `kickoffUtc` se guarda siempre como ISO-8601 UTC (`.toISOString()`),
 *    que es lexicográficamente ordenable, así que la comparación de strings
 *    `kickoff_utc <= nowIso` es correcta (mismo patrón que
 *    notify-kickoff-today.ts). `nowIso` también es UTC ⇒ no hay desfase de
 *    timezone.
 *  - Se incluye 'suspended' porque un partido suspendido YA arrancó (se
 *    interrumpió en juego); su pronóstico ya era público. No incluirlo
 *    OCULTARÍA pronósticos ya revelados, no expondría de más.
 *  - El gate por kickoff es redundante con el de status, pero lo dejamos por
 *    robustez: si el cron que flippea status se atrasa, el pronóstico igual
 *    se revela al minuto de kickoff (y nunca antes).
 *  - NO contemplamos `predictionsVisibility === 'always'`: ese flag es
 *    por-liga y un perfil es cross-liga. Ante la duda, gateamos puramente
 *    por matchStarted (la regla más restrictiva y segura).
 *
 * SCOPE (¿solo ligas compartidas con el requester, o todas?)
 * ────────────────────────────────────────────────────────────────────────
 * Mostramos pronósticos de partidos ya arrancados SIN restringir por liga
 * compartida. Justificación: una vez que el partido arrancó, el pronóstico
 * de ese usuario para ese partido es efectivamente público (cualquier
 * miembro de cualquiera de sus ligas ya puede verlo). Restringir por liga
 * compartida no agregaría seguridad real y complicaría la query; lo único
 * que cambia entre ligas es el marcador (que el usuario pudo editar por
 * liga), por lo que deduplicamos por partido quedándonos con UN pronóstico
 * por match (ver más abajo).
 */
export async function userPredictionHistoryHandler(req: Request, res: Response) {
  // Requester autenticado (authGuard ya corrió). No se usa para el gate de
  // revelado —el gate es puramente matchStarted— pero exigir auth evita que
  // el endpoint sea anónimo.
  const requesterId = req.user!.id;
  void requesterId;

  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AppError('VALIDATION', 'userId must be a positive integer', 400);
  }

  const targetUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .get();
  if (!targetUser) throw new NotFoundError('User');

  // `now` SIEMPRE del servidor. El cliente no puede influir en el gate.
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');

  // GATE DE SEGURIDAD (capa 1 — SQL). Este WHERE ya descarta en la DB todo
  // partido que no arrancó. El término por kickoff usa comparación de strings
  // (kickoff_utc es ISO-8601 UTC, lexicográficamente ordenable), igual que
  // notify-kickoff-today.ts.
  //
  // ⚠️ La comparación lexical asume que TODO kickoff está en forma canónica
  // `...Z`. Si algún día un writer guardara un offset (`-03:00`) o sin `Z`,
  // el compare lexical podría clasificar mal. Para no depender de esa
  // suposición en un gate de seguridad, abajo hay una SEGUNDA capa en JS que
  // re-verifica con epoch (offset-tolerante, igual que el handler canónico
  // match-predictions.ts). El SQL acá es solo un prefiltro: nunca puede
  // REVELAR de más respecto de la capa 2, y reduce filas traídas.
  const matchStarted = or(
    inArray(matches.status, ['live', 'finished', 'suspended']),
    lte(matches.kickoffUtc, nowIso),
  );

  // Re-chequeo server-side por epoch. `new Date(x).getTime()` tolera offsets
  // y normaliza a UTC; si el string es inválido da NaN y `NaN <= nowMs` es
  // false ⇒ el partido queda OCULTO (fail-safe), nunca expuesto.
  const hasStarted = (status: string, kickoffUtc: string): boolean => {
    if (status === 'live' || status === 'finished' || status === 'suspended') {
      return true;
    }
    return new Date(kickoffUtc).getTime() <= nowMs;
  };

  const rows = await db
    .select({
      predictionId: predictions.id,
      matchId: predictions.matchId,
      homeScore: predictions.homeScore,
      awayScore: predictions.awayScore,
      points: predictions.points,
      updatedAt: predictions.updatedAt,
      kickoffUtc: matches.kickoffUtc,
      matchStatus: matches.status,
      matchHomeScore: matches.homeScore,
      matchAwayScore: matches.awayScore,
      decidedByPenalties: matches.decidedByPenalties,
      round: matches.round,
      homeTeamName: homeTeams.name,
      homeTeamCode: homeTeams.code,
      homeTeamFlag: homeTeams.flag,
      awayTeamName: awayTeams.name,
      awayTeamCode: awayTeams.code,
      awayTeamFlag: awayTeams.flag,
    })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .leftJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(and(eq(predictions.userId, targetUserId), matchStarted))
    // kickoff desc = más reciente primero. El segundo criterio (updatedAt
    // desc) es un desempate DETERMINÍSTICO entre las filas por-liga del mismo
    // partido: sin él, el pronóstico elegido por la dedupe variaba entre
    // requests (orden físico de SQLite). Con él siempre mostramos el editado
    // más recientemente.
    .orderBy(desc(matches.kickoffUtc), desc(predictions.updatedAt));

  // Dedupe por partido. Un usuario puede tener un pronóstico por liga para el
  // mismo match; en el perfil cross-liga mostramos UNO por partido. Las filas
  // vienen ordenadas por kickoff desc + updatedAt desc, así que la primera
  // vista por matchId es la editada más recientemente (determinístico).
  const seen = new Set<number>();
  const data = rows
    // CAPA 2 del gate de seguridad: re-verificación por epoch en el server.
    // Redundante con el WHERE SQL en el caso normal, pero protege si un
    // kickoff quedó guardado en forma no canónica. Fail-safe: oculta, no
    // expone.
    .filter((row) => hasStarted(row.matchStatus, row.kickoffUtc))
    .filter((row) => {
      if (seen.has(row.matchId)) return false;
      seen.add(row.matchId);
      return true;
    })
    .map((row) => {
      // Resultado del pronóstico, derivado en el server.
      //  - 'pending': el partido arrancó pero todavía no hay marcador final.
      //  - 'exact'  : marcador exacto.
      //  - 'correct': acertó ganador/empate pero no el marcador exacto.
      //  - 'missed' : falló.
      let outcome: 'pending' | 'exact' | 'correct' | 'missed' = 'pending';
      // El score guardado puede venir "bumpeado" (+1 al ganador) si se decidió
      // por penales — usamos el resultado de reglamento, igual que
      // match-detail/matches/bracket-view (ver acfe7c2).
      const { homeScore: mh, awayScore: ma } = regulationScore(
        row.matchHomeScore,
        row.matchAwayScore,
        row.decidedByPenalties === 1,
      );
      if (mh != null && ma != null) {
        const exact = mh === row.homeScore && ma === row.awayScore;
        const sign = (h: number, a: number) => (h > a ? 1 : h < a ? -1 : 0);
        const correctResult = sign(mh, ma) === sign(row.homeScore, row.awayScore);
        outcome = exact ? 'exact' : correctResult ? 'correct' : 'missed';
      }

      return {
        predictionId: row.predictionId,
        matchId: row.matchId,
        round: row.round,
        kickoffUtc: row.kickoffUtc,
        matchStatus: row.matchStatus,
        prediction: {
          homeScore: row.homeScore,
          awayScore: row.awayScore,
        },
        result:
          mh != null && ma != null
            ? { homeScore: mh, awayScore: ma }
            : null,
        points: row.points,
        outcome,
        homeTeam: {
          name: row.homeTeamName,
          code: row.homeTeamCode,
          flag: row.homeTeamFlag,
        },
        awayTeam: {
          name: row.awayTeamName,
          code: row.awayTeamCode,
          flag: row.awayTeamFlag,
        },
      };
    });

  return res.json({ data, meta: { total: data.length } });
}
