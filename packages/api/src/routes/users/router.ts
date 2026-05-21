import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { myStatsHandler } from './handlers/my-stats.js';
import { globalLeaderboardHandler } from './handlers/global-leaderboard.js';
import { updateMeHandler } from './handlers/update-me.js';

export const usersRouter = Router();

// Public routes — no auth required
usersRouter.get('/leaderboard', (req, res, next) => globalLeaderboardHandler(req, res).catch(next));

usersRouter.use(authGuard);

usersRouter.get('/me/stats', (req, res, next) => myStatsHandler(req, res).catch(next));
usersRouter.patch('/me', (req, res, next) => updateMeHandler(req, res).catch(next));
