import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { UnauthorizedError, AppError } from '../../../lib/errors.js';
import { db } from '../../../db/index.js';
import { users } from '../../../db/schema/index.js';

// ADMIN_USER_IDS queda como fallback/bootstrap (arranca la app sin admins en
// DB); users.isAdmin permite sumar admins sin redeploy vía PATCH /admin/users/:id.
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new UnauthorizedError();

    const adminIds = process.env.ADMIN_USER_IDS?.split(',').map(Number).filter(Boolean) ?? [];
    if (adminIds.includes(req.user.id)) return next();

    const [row] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, req.user.id));
    if (!row?.isAdmin) throw new AppError('FORBIDDEN', 'Admin access required', 403);

    next();
  } catch (err) {
    next(err);
  }
}
