import { Router } from 'express';
import { listTeamsHandler } from './handlers/list-teams.js';
import { getTeamHandler } from './handlers/get-team.js';

export const teamsRouter = Router();
teamsRouter.get('/', (req, res, next) => listTeamsHandler(req, res).catch(next));
teamsRouter.get('/:id', (req, res, next) => getTeamHandler(req, res).catch(next));
