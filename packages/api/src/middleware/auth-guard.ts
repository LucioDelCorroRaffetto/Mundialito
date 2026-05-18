import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../lib/errors.js';

export function authGuard(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new UnauthorizedError();
  next();
}
