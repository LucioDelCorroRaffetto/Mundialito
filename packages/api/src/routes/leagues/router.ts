import { Router } from 'express';
import { authGuard } from '../../middleware/auth-guard.js';
import { validate } from '../../middleware/validate.js';
import { createLeagueHandler, createLeagueSchema } from './handlers/create-league.js';
import { listMineHandler } from './handlers/list-mine.js';
import { getLeagueHandler } from './handlers/get-league.js';
import { getLeagueByCodeHandler } from './handlers/get-league-by-code.js';
import { updateLeagueHandler, updateLeagueSchema } from './handlers/update-league.js';
import { deleteLeagueHandler } from './handlers/delete-league.js';
import { joinLeagueHandler, joinLeagueSchema } from './handlers/join-league.js';
import { leaveLeagueHandler } from './handlers/leave-league.js';
import { listMembersHandler } from './handlers/list-members.js';
import { kickMemberHandler } from './handlers/kick-member.js';
import { standingsHandler } from './handlers/standings.js';
import { searchPublicHandler } from './handlers/search-public.js';

export const leaguesRouter = Router();

// Public route — no auth required (league preview before joining)
leaguesRouter.get('/by-code/:code', (req, res, next) => getLeagueByCodeHandler(req, res).catch(next));

leaguesRouter.use(authGuard);

// Rutas estáticas primero para que no las matchee `/:id`
leaguesRouter.get('/mine', (req, res, next) => listMineHandler(req, res).catch(next));
leaguesRouter.get('/public/search', (req, res, next) => searchPublicHandler(req, res).catch(next));
leaguesRouter.post('/join', validate(joinLeagueSchema), (req, res, next) =>
  joinLeagueHandler(req, res).catch(next)
);

leaguesRouter.post('/', validate(createLeagueSchema), (req, res, next) =>
  createLeagueHandler(req, res).catch(next)
);

leaguesRouter.get('/:id', (req, res, next) => getLeagueHandler(req, res).catch(next));
leaguesRouter.patch('/:id', validate(updateLeagueSchema), (req, res, next) =>
  updateLeagueHandler(req, res).catch(next)
);
leaguesRouter.delete('/:id', (req, res, next) => deleteLeagueHandler(req, res).catch(next));
leaguesRouter.delete('/:id/leave', (req, res, next) => leaveLeagueHandler(req, res).catch(next));
leaguesRouter.get('/:id/members', (req, res, next) => listMembersHandler(req, res).catch(next));
leaguesRouter.delete('/:id/members/:userId', (req, res, next) =>
  kickMemberHandler(req, res).catch(next)
);
leaguesRouter.get('/:id/standings', (req, res, next) => standingsHandler(req, res).catch(next));
