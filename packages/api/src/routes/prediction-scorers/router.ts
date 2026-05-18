import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { getScorersHandler } from './handlers/get-scorers.js';
import { upsertScorersHandler, upsertScorersSchema } from './handlers/upsert-scorers.js';

export const predictionScorersRouter = Router();

predictionScorersRouter.use(authGuard);

predictionScorersRouter.get('/', (req, res, next) =>
  getScorersHandler(req, res).catch(next),
);

predictionScorersRouter.put(
  '/',
  validate(upsertScorersSchema),
  (req, res, next) => upsertScorersHandler(req, res).catch(next),
);
