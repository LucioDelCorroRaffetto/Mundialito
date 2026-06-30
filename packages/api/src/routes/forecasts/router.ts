import { Router } from 'express';
import { inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { teams } from '../../db/schema/index.js';
import { forecastMatch, forecastTeams, forecastTournament } from '../../services/forecast-service.js';
import { AppError, NotFoundError } from '../../lib/errors.js';

export const forecastsRouter = Router();

/** GET /forecasts/match/:matchId
 *  Probabilidades 1X2 + marcadores más probables para un partido.
 *
 *  Acepta `?home=<id>&away=<id>` opcional: en los cruces de eliminación la DB
 *  guarda el placeholder TBD en home/awayTeamId, así que el front resuelve los
 *  equipos reales vía proyección del cuadro y los pasa acá. Sólo se aceptan si
 *  ambos ids existen y NO son el placeholder TBD; si no, se cae al cálculo por
 *  matchId (compatibilidad). */
forecastsRouter.get('/match/:matchId', async (req, res, next) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      throw new AppError('VALIDATION', 'Invalid matchId', 400);
    }

    const homeOverride = Number(req.query.home);
    const awayOverride = Number(req.query.away);
    const hasOverride =
      Number.isInteger(homeOverride) && homeOverride > 0 &&
      Number.isInteger(awayOverride) && awayOverride > 0;

    if (hasOverride) {
      const found = await db
        .select({ id: teams.id, code: teams.code })
        .from(teams)
        .where(inArray(teams.id, [homeOverride, awayOverride]));
      const real = new Set(found.filter((t) => t.code !== 'TBD').map((t) => t.id));
      if (real.has(homeOverride) && real.has(awayOverride)) {
        const data = await forecastTeams(homeOverride, awayOverride);
        res.json({ data });
        return;
      }
    }

    const data = await forecastMatch(matchId);
    if (!data) throw new NotFoundError('Match');
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** GET /forecasts/tournament
 *  Monte Carlo del bracket completo — probabilidades de avance por equipo. */
forecastsRouter.get('/tournament', async (_req, res, next) => {
  try {
    const data = await forecastTournament();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
