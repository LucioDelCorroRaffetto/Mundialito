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
    // Derive the client IP from X-Forwarded-For, taking the LAST entry — the
    // one appended by the closest trusted proxy (Render's LB) — not the first.
    // A client can prepend arbitrary values to XFF to spoof the leftmost IP
    // and bypass the limiter (password spray with a rotating fake IP each
    // request); it cannot forge the hop the proxy itself adds. Fall back to
    // the raw socket address when there is no proxy header.
    const xff = req.headers['x-forwarded-for'];
    const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const ip = hops.length > 0
      ? hops[hops.length - 1]
      : (req.socket.remoteAddress || 'unknown');
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
