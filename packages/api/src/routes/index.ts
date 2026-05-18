import { Router } from 'express';
import { authRouter } from './auth/router.js';
import { matchesRouter } from './matches/router.js';
import { predictionsRouter } from './predictions/router.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/matches', matchesRouter);
apiRouter.use('/predictions', predictionsRouter);

// Placeholder hasta Sprint 4:
apiRouter.get('/leagues', (_req, res) => res.json({ data: [], meta: { total: 0 } }));
