import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth.js';

interface Bucket {
  count: number;
  windowStart: number;
}

// Per-process, in-memory fixed-window counters keyed by "action:userId" — this
// app runs as a single Express instance (no Redis/multi-instance setup), so
// there's nothing to share this across; that's fine for stopping spam clicks,
// not meant to be exact under horizontal scaling.
const buckets = new Map<string, Bucket>();

// Sweep stale buckets periodically so this can't grow unbounded over a long
// server lifetime. unref() so it never keeps the process alive on its own.
const SWEEP_INTERVAL_MS = 5 * 60_000;
const STALE_AFTER_MS = 10 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > STALE_AFTER_MS) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

/**
 * Caps how often one caller can hit a given action — a fixed window per
 * "action:identity". Keys on the authenticated user id when there is one
 * (the common case, after requireAuth); on public routes with no session it
 * falls back to the client IP so unauthenticated endpoints (e.g. invite-link
 * resolve) can't be hammered. IP keying needs `trust proxy` set (see index.ts)
 * or every request looks like it comes from the proxy.
 */
export function rateLimit(action: string, { max, windowMs }: { max: number; windowMs: number }) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const identity = req.user?.id ?? `ip:${req.ip ?? 'unknown'}`;
    const key = `${action}:${identity}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      next();
      return;
    }
    if (bucket.count >= max) {
      const retryAfterMs = windowMs - (now - bucket.windowStart);
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
      res.status(429).json({ error: 'Slow down — you’re doing that too fast. Try again in a moment.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}
