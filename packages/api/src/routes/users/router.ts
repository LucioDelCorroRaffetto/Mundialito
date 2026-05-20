import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { myStatsHandler } from './handlers/my-stats.js';

export const usersRouter = Router();

usersRouter.use(authGuard);

usersRouter.get('/me/stats', (req, res, next) => myStatsHandler(req, res).catch(next));
