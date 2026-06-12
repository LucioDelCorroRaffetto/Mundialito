import { Router } from 'express';
import { forecastMatch, forecastTournament } from '../../services/forecast-service.js';
import { AppError, NotFoundError } from '../../lib/errors.js';

export const forecastsRouter = Router();

/** GET /forecasts/match/:matchId
 *  Probabilidades 1X2 + marcadores más probables para un partido. */
forecastsRouter.get('/match/:matchId', async (req, res, next) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      throw new AppError('VALIDATION', 'Invalid matchId', 400);
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
