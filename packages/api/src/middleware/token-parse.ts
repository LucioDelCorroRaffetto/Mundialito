import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/jwt.js';
import { recordLoginDay } from '../lib/login-day-tracker.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; username: string };
    }
  }
}

export function tokenParse(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccess(auth.slice(7));
      req.user = { id: payload.sub, username: payload.username };
      // Mark the user as active today (used by the `loyal` logro). Cached
      // in-memory and fire-and-forget, so it doesn't add latency.
      recordLoginDay(payload.sub);
    } catch {
      // token inválido — se ignora, auth-guard lo rechazará si la ruta lo requiere
    }
  }
  next();
}
