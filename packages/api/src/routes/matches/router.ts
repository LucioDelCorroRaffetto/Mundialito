import { Router } from 'express';
import { listMatchesHandler } from './handlers/list-matches.js';
import { getMatchHandler } from './handlers/get-match.js';

export const matchesRouter = Router();

matchesRouter.get('/', (req, res, next) => listMatchesHandler(req, res).catch(next));
matchesRouter.get('/:id', (req, res, next) => getMatchHandler(req, res).catch(next));
