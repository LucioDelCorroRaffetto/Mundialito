import { Request, Response } from 'express';
import { z } from 'zod';
import { revokeToken, revokeAllForUser } from '../../../lib/refresh-store.js';

export const logoutSchema = z.object({ refreshToken: z.string().optional() });

export async function logoutHandler(req: Request, res: Response) {
  const { refreshToken } = req.body as z.infer<typeof logoutSchema>;
  if (refreshToken) {
    await revokeToken(refreshToken);
  } else {
    await revokeAllForUser(req.user!.id);
  }
  return res.status(204).send();
}
