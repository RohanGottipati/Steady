import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/voice/rate-limit";

describe("createRateLimiter (fixed window)", () => {
  it("allows requests up to the limit within a window", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => now });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    limiter.check("ip");
    limiter.check("ip");
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
    now = 1001;
    expect(limiter.check("ip").allowed).toBe(true);
  });
});
