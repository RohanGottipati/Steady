/**
 * Minimal in-memory fixed-window rate limiter for the dynamic TTS route (B7
 * review hardening). Best-effort only — on serverless it limits per warm
 * instance, which is sufficient to blunt casual abuse of a public hackathon
 * deploy without adding infrastructure. `now` is injectable for tests.
 */
export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  // key -> window start timestamp + count within that window
  const windows = new Map<string, { start: number; count: number }>();

  return {
    check(key: string): RateLimitResult {
      const t = now();
      const existing = windows.get(key);
      if (!existing || t - existing.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (existing.count < limit) {
        existing.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: existing.start + windowMs - t };
    },
    reset(): void {
      windows.clear();
    },
  };
}
