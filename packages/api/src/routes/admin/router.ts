import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { requireAdmin } from './middleware/require-admin.js';
import { updateMatchHandler } from './handlers/update-match.js';
import { updatePlayerHandler } from './handlers/update-player.js';
import { syncScoresHandler } from './handlers/sync-scores.js';

export const adminRouter = Router();

adminRouter.use(authGuard);
adminRouter.use(requireAdmin);

adminRouter.put('/matches/:id', (req, res, next) => updateMatchHandler(req, res).catch(next));
adminRouter.patch('/players/:id', (req, res, next) => updatePlayerHandler(req, res).catch(next));
adminRouter.post('/sync-scores', (req, res, next) => syncScoresHandler(req, res).catch(next));
