import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { listAchievementsHandler } from './handlers/list-achievements.js';
import { myAchievementsHandler } from './handlers/my-achievements.js';

export const achievementsRouter = Router();

// GET /achievements — public, no auth required
achievementsRouter.get('/', (req, res, next) => listAchievementsHandler(req, res).catch(next));

// GET /achievements/mine — requires auth
achievementsRouter.get('/mine', authGuard, (req, res, next) => myAchievementsHandler(req, res).catch(next));
