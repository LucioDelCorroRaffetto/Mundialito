import { Router } from 'express';
import { authRouter } from './auth/router.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Placeholder para próximos sprints:
apiRouter.get('/matches', (_req, res) => res.json({ data: [], meta: { total: 0 } }));
apiRouter.get('/leagues', (_req, res) => res.json({ data: [], meta: { total: 0 } }));
