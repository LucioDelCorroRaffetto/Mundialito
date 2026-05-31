import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { getMyTeamHandler } from './handlers/get-my-team.js';
import { getUserFantasyTeamHandler } from './handlers/get-user-fantasy-team.js';
import { ensureMyTeamHandler, ensureMyTeamSchema } from './handlers/ensure-my-team.js';
import { updateSquadHandler, updateSquadSchema } from './handlers/update-squad.js';
import { getFantasyStandingsHandler } from './handlers/get-fantasy-standings.js';
import { getFantasyRoundsHandler } from './handlers/get-rounds.js';
import { upsertLineupHandler, upsertLineupSchema } from './handlers/upsert-lineup.js';
import { getMyLineupHandler } from './handlers/get-lineup.js';

export const fantasyRouter = Router();

fantasyRouter.use(authGuard);

fantasyRouter.get('/my-team', (req, res, next) => getMyTeamHandler(req, res).catch(next));
fantasyRouter.post('/my-team', validate(ensureMyTeamSchema), (req, res, next) =>
  ensureMyTeamHandler(req, res).catch(next)
);
fantasyRouter.put('/squad', validate(updateSquadSchema), (req, res, next) =>
  updateSquadHandler(req, res).catch(next)
);
fantasyRouter.get('/standings', (req, res, next) => getFantasyStandingsHandler(req, res).catch(next));
fantasyRouter.get('/team/:userId', (req, res, next) => getUserFantasyTeamHandler(req, res).catch(next));

// Fantasy rounds + per-round lineups
fantasyRouter.get('/rounds', (req, res, next) => getFantasyRoundsHandler(req, res).catch(next));
fantasyRouter.put('/lineup/:round', validate(upsertLineupSchema), (req, res, next) =>
  upsertLineupHandler(req, res).catch(next),
);
fantasyRouter.get('/lineup/:round', (req, res, next) => getMyLineupHandler(req, res).catch(next));
