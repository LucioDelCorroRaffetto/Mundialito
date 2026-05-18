import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { getTournamentPredictionHandler } from './handlers/get-tournament-prediction.js';
import {
  upsertTournamentPredictionHandler,
  upsertTournamentPredictionSchema,
} from './handlers/upsert-tournament-prediction.js';

export const tournamentPredictionsRouter = Router();

tournamentPredictionsRouter.use(authGuard);

tournamentPredictionsRouter.get('/', (req, res, next) =>
  getTournamentPredictionHandler(req, res).catch(next),
);

tournamentPredictionsRouter.post(
  '/',
  validate(upsertTournamentPredictionSchema),
  (req, res, next) => upsertTournamentPredictionHandler(req, res).catch(next),
);
