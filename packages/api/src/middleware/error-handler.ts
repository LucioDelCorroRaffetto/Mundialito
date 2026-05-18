import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { NODE_ENV } from '../constants.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  if (NODE_ENV !== 'production') console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
