import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { upsertPredictionHandler, upsertPredictionSchema } from './handlers/upsert-prediction.js';
import { myPredictionsHandler } from './handlers/my-predictions.js';
import { myPredictionForMatchHandler } from './handlers/my-prediction-for-match.js';
import { myPredictionByLeagueHandler } from './handlers/my-prediction-by-league.js';
import { matchPredictionsHandler } from './handlers/match-predictions.js';
import { userPredictionHistoryHandler } from './handlers/user-prediction-history.js';
import { deletePredictionHandler } from './handlers/delete-prediction.js';
import { markPredictionSharedHandler } from './handlers/mark-shared.js';

export const predictionsRouter = Router();

predictionsRouter.use(authGuard);

predictionsRouter.post('/', validate(upsertPredictionSchema), (req, res, next) =>
  upsertPredictionHandler(req, res).catch(next)
);
predictionsRouter.get('/mine', (req, res, next) => myPredictionsHandler(req, res).catch(next));
predictionsRouter.get('/match/:matchId/mine', (req, res, next) =>
  myPredictionForMatchHandler(req, res).catch(next)
);
predictionsRouter.get('/match/:matchId/mine-by-league', (req, res, next) =>
  myPredictionByLeagueHandler(req, res).catch(next)
);
predictionsRouter.get('/match/:matchId', (req, res, next) =>
  matchPredictionsHandler(req, res).catch(next)
);
// Historial público de pronósticos de OTRO usuario (perfil ajeno). El gate
// de "solo partidos ya arrancados" vive en el handler (server-side).
predictionsRouter.get('/user/:userId/history', (req, res, next) =>
  userPredictionHistoryHandler(req, res).catch(next)
);
predictionsRouter.post('/shared', (req, res, next) => markPredictionSharedHandler(req, res).catch(next));
predictionsRouter.delete('/:id', (req, res, next) => deletePredictionHandler(req, res).catch(next));
