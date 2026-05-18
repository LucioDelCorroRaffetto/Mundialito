import { Request, Response } from 'express';
import { z } from 'zod';
import { verifyRefresh, signAccess, signRefresh } from '../../../lib/jwt.js';
import { UnauthorizedError } from '../../../lib/errors.js';

export const refreshSchema = z.object({ refreshToken: z.string() });

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  try {
    const payload = verifyRefresh(refreshToken);
    const newPayload = { sub: payload.sub, username: payload.username };
    return res.json({
      accessToken: signAccess(newPayload),
      refreshToken: signRefresh(newPayload),
    });
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}
