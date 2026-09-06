export type RateLimitDecision = {
  ok: boolean;
  remaining: number;
};

export type RateLimiter = {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
};

/**
 * Process-local limiter for development. Production public launch needs a
 * distributed implementation (Redis or equivalent) before exposing intake widely.
 */
export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async consume(key, limit, windowMs) {
      const current = now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= current) {
        buckets.set(key, { count: 1, resetAt: current + windowMs });
        return { ok: true, remaining: Math.max(0, limit - 1) };
      }
      if (existing.count >= limit) {
        return { ok: false, remaining: 0 };
      }
      existing.count += 1;
      return { ok: true, remaining: Math.max(0, limit - existing.count) };
    },
  };
}

let shared: RateLimiter | undefined;

export function getPublicRateLimiter(): RateLimiter {
  if (!shared) {
    shared = createMemoryRateLimiter();
  }
  return shared;
}
