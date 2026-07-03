import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { myStatsHandler } from './handlers/my-stats.js';
import { globalLeaderboardHandler } from './handlers/global-leaderboard.js';
import { updateMeHandler } from './handlers/update-me.js';
import { getPublicProfileHandler } from './handlers/get-public-profile.js';
import { getAdminProfileHandler } from './handlers/get-admin-profile.js';
import { wrappedHandler } from './handlers/wrapped.js';

export const usersRouter = Router();

// Static public routes first (must precede dynamic /:userId to avoid capture)
usersRouter.get('/leaderboard', (req, res, next) => globalLeaderboardHandler(req, res).catch(next));
usersRouter.get('/admin', (req, res, next) => getAdminProfileHandler(req, res).catch(next));

// Protected /me/* routes — registered before /:userId so they match first
usersRouter.get('/me/stats', authGuard, (req, res, next) => myStatsHandler(req, res).catch(next));
usersRouter.get('/me/wrapped', authGuard, (req, res, next) => wrappedHandler(req, res).catch(next));
usersRouter.patch('/me', authGuard, (req, res, next) => updateMeHandler(req, res).catch(next));

// Dynamic public profile — catches all remaining /:userId patterns
usersRouter.get('/:userId', (req, res, next) => getPublicProfileHandler(req, res).catch(next));
