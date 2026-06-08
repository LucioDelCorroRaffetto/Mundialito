import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { requireAdmin } from './middleware/require-admin.js';
import { updateMatchHandler } from './handlers/update-match.js';
import { updatePlayerHandler } from './handlers/update-player.js';
import { syncScoresHandler } from './handlers/sync-scores.js';
import { getPlayerStatsHandler } from './handlers/get-player-stats.js';
import { updatePlayerStatsHandler } from './handlers/update-player-stats.js';
import { syncPlayerStatsHandler } from './handlers/sync-player-stats.js';
import { finalizeFantasyHandler } from './handlers/finalize-fantasy.js';

export const adminRouter = Router();

adminRouter.use(authGuard);
adminRouter.use(requireAdmin);

adminRouter.put('/matches/:id', (req, res, next) => updateMatchHandler(req, res).catch(next));
adminRouter.patch('/players/:id', (req, res, next) => updatePlayerHandler(req, res).catch(next));
adminRouter.post('/sync-scores', (req, res, next) => syncScoresHandler(req, res).catch(next));
adminRouter.get('/matches/:matchId/player-stats', (req, res, next) =>
  getPlayerStatsHandler(req, res).catch(next),
);
adminRouter.put('/matches/:matchId/player-stats', (req, res, next) =>
  updatePlayerStatsHandler(req, res).catch(next),
);
// Auto-sync per-player stats for a finished match from API-Football.
// Same logic auto-fires from the score sync, but the admin can force a
// refresh from here if needed.
adminRouter.post('/matches/:id/sync-player-stats', (req, res, next) =>
  syncPlayerStatsHandler(req, res).catch(next),
);

// Awards fantasy_legend to the league-winning fantasy player in each league.
// Call once when the fantasy season closes.
adminRouter.post('/finalize-fantasy', (req, res, next) =>
  finalizeFantasyHandler(req, res).catch(next),
);
