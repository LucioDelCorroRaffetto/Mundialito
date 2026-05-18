import { Router } from 'express';
import { listPlayersHandler } from './handlers/list-players.js';

export const playersRouter = Router();
playersRouter.get('/', (req, res, next) => listPlayersHandler(req, res).catch(next));
