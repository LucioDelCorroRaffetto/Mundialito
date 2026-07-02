import { Request, Response } from 'express';
import { z } from 'zod';
import { signAccess } from '../../../lib/jwt.js';
import { rotateRefreshToken } from '../../../lib/refresh-store.js';

export const refreshSchema = z.object({ refreshToken: z.string() });

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const { token, payload } = await rotateRefreshToken(refreshToken);
  return res.json({
    accessToken: signAccess({ sub: payload.sub, username: payload.username }),
    refreshToken: token,
  });
}
