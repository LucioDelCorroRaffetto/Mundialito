import { Request, Response } from 'express';

export function vapidKeyHandler(_req: Request, res: Response) {
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
}
