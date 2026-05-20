import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { myStatsHandler } from './handlers/my-stats.js';
import { globalLeaderboardHandler } from './handlers/global-leaderboard.js';

export const usersRouter = Router();

// Public routes — no auth required
usersRouter.get('/leaderboard', (req, res, next) => globalLeaderboardHandler(req, res).catch(next));

usersRouter.use(authGuard);

usersRouter.get('/me/stats', (req, res, next) => myStatsHandler(req, res).catch(next));
