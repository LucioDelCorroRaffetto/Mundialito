import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { requireAdmin } from './middleware/require-admin.js';
import { updateMatchHandler } from './handlers/update-match.js';
import { updatePlayerHandler } from './handlers/update-player.js';
import { syncScoresHandler } from './handlers/sync-scores.js';
import { getPlayerStatsHandler } from './handlers/get-player-stats.js';
import { updatePlayerStatsHandler } from './handlers/update-player-stats.js';
import { syncPlayerStatsHandler } from './handlers/sync-player-stats.js';
import { diagnoseFifaHandler } from './handlers/diagnose-fifa.js';
import { finalizeFantasyHandler } from './handlers/finalize-fantasy.js';
import { syncAllFinishedStatsHandler } from './handlers/sync-all-finished-stats.js';
import { updateUserAdminHandler } from './handlers/update-user-admin.js';

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
// Self-test of the FIFA stats pipeline. Returns a structured report — admin
// UI / external monitoring can poll this and alert if `body.ok === false`.
adminRouter.get('/diagnostics/fifa-self-test', (req, res, next) =>
  diagnoseFifaHandler(req, res).catch(next),
);

// Awards fantasy_legend to the league-winning fantasy player in each league.
// Call once when the fantasy season closes.
adminRouter.post('/finalize-fantasy', (req, res, next) =>
  finalizeFantasyHandler(req, res).catch(next),
);

// Re-runs FIFA stats sync for all finished matches. Use ?force=false to skip
// matches that already have stats. Useful for backfills or after alias fixes.
adminRouter.post('/sync-all-finished-stats', (req, res, next) =>
  syncAllFinishedStatsHandler(req, res).catch(next),
);

// Toggle de admin en DB sin redeploy (ADMIN_USER_IDS sigue como fallback/bootstrap).
adminRouter.patch('/users/:id', (req, res, next) => updateUserAdminHandler(req, res).catch(next));
