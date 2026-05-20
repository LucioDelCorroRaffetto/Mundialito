import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, AppError } from '../../../lib/errors.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new UnauthorizedError();

  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
  if (!adminIds.includes(req.user.id)) {
    throw new AppError('FORBIDDEN', 'Admin access required', 403);
  }

  next();
}
