import { Router } from 'express';
import { getLeaderboardsHandler } from './handlers/get-leaderboards.js';

export const statsRouter = Router();

statsRouter.get('/leaderboards', (req, res, next) =>
  getLeaderboardsHandler(req, res).catch(next),
);
