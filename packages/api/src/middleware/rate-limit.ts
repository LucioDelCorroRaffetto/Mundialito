import type { Request, Response, NextFunction } from 'express';

/**
 * Tiny in-memory rate limiter to throttle login/register/google brute force
 * attempts. Not distributed — fine for our single-instance Render deploy.
 *
 * Window-based: each (key, windowStart) bucket counts requests until it
 * expires. The key is `${ip}:${routeKey}` so a single attacker probing
 * /login doesn't accidentally lock out /register for other users sharing
 * a proxy IP.
 *
 * Failure mode: when over the limit we return 429 with `Retry-After`. The
 * map is cleaned up lazily — every Nth call we sweep expired entries.
 */
interface Bucket {
  count: number;
  expiresAt: number;
}

const buckets = new Map<string, Bucket>();
let sweepCounter = 0;
const SWEEP_EVERY = 200;

export function rateLimit({
  windowMs,
  max,
  routeKey,
}: {
  windowMs: number;
  max: number;
  routeKey: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Respect a reverse proxy if it sets X-Forwarded-For (Render does).
    // Fall back to remoteAddress otherwise.
    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${ip}:${routeKey}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { count: 0, expiresAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    // Lazy sweep to bound memory.
    sweepCounter += 1;
    if (sweepCounter >= SWEEP_EVERY) {
      sweepCounter = 0;
      for (const [k, b] of buckets) {
        if (b.expiresAt <= now) buckets.delete(k);
      }
    }

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiados intentos, esperá un momento.',
        },
      });
    }
    next();
  };
}
