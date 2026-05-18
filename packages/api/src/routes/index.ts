import { Router } from 'express';
import { authRouter } from './auth/router.js';
import { matchesRouter } from './matches/router.js';
import { predictionsRouter } from './predictions/router.js';
import { leaguesRouter } from './leagues/router.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/matches', matchesRouter);
apiRouter.use('/predictions', predictionsRouter);
apiRouter.use('/leagues', leaguesRouter);
