import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/jwt.js';

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
    } catch {
      // token inválido — se ignora, auth-guard lo rechazará si la ruta lo requiere
    }
  }
  next();
}
