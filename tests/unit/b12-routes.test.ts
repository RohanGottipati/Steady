// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  handleCoachingSearch,
  handleDeviationAnalytics,
  handleSimilarAttempts,
} from "@/lib/db/search-handlers";
import type { RateLimiter } from "@/lib/voice/rate-limit";

const ATTEMPT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const blockingLimiter: RateLimiter = {
  check: () => ({ allowed: false, retryAfterMs: 5000 }),
  reset: () => {},
};

function req(url: string) {
  return new Request(url);
}

describe("GET /api/similar-attempts handler", () => {
  it("400s on a missing/malformed attemptId or a missing anonymousUserId", async () => {
    expect((await handleSimilarAttempts(req("http://local/api/similar-attempts"))).status).toBe(400);
    expect(
      (await handleSimilarAttempts(req("http://local/api/similar-attempts?attemptId=nope"))).status,
    ).toBe(400);
    // valid attemptId but no owner id is still a 400 (ownership is required)
    expect(
      (await handleSimilarAttempts(req(`http://local/x?attemptId=${ATTEMPT}`))).status,
    ).toBe(400);
  });

  it("passes the owner id through to the similarity query", async () => {
    const seen: string[] = [];
    const res = await handleSimilarAttempts(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      findSimilar: async (a, u) => {
        seen.push(a, u);
        return [];
      },
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([ATTEMPT, USER]);
  });

  it("503s when similarity is unavailable (null)", async () => {
    const res = await handleSimilarAttempts(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      findSimilar: async () => null,
    });
    expect(res.status).toBe(503);
  });

  it("returns the similar attempts when available", async () => {
    const res = await handleSimilarAttempts(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      findSimilar: async () => [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ similar: [] });
  });

  it("429s before touching the database", async () => {
    let called = false;
    const res = await handleSimilarAttempts(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      rateLimiter: blockingLimiter,
      findSimilar: async () => {
        called = true;
        return [];
      },
    });
    expect(res.status).toBe(429);
    expect(called).toBe(false);
  });
});

describe("GET /api/search handler", () => {
  it("400s when skillId or q is missing", async () => {
    expect((await handleCoachingSearch(req("http://local/api/search?q=jerky"))).status).toBe(400);
    expect((await handleCoachingSearch(req("http://local/api/search?skillId=needle-passing"))).status).toBe(400);
  });

  it("returns ranked documents", async () => {
    const res = await handleCoachingSearch(
      req("http://local/api/search?skillId=needle-passing&q=jerky%20motion"),
      { search: async () => [{ id: "d1", title: "T", content: "C" }] },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documents: [{ id: "d1", title: "T", content: "C" }] });
  });

  it("429s before touching the database", async () => {
    let called = false;
    const res = await handleCoachingSearch(
      req("http://local/api/search?skillId=needle-passing&q=jerky"),
      {
        rateLimiter: blockingLimiter,
        search: async () => {
          called = true;
          return [];
        },
      },
    );
    expect(res.status).toBe(429);
    expect(called).toBe(false);
  });
});

describe("GET /api/analytics handler", () => {
  it("400s on a malformed attemptId or a missing anonymousUserId", async () => {
    expect((await handleDeviationAnalytics(req("http://local/x?attemptId=nope"))).status).toBe(400);
    // valid attemptId but no owner id is still a 400 (ownership is required)
    expect((await handleDeviationAnalytics(req(`http://local/x?attemptId=${ATTEMPT}`))).status).toBe(400);
  });

  it("passes the owner id through to both analytics queries", async () => {
    const seen: string[] = [];
    const res = await handleDeviationAnalytics(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      getStats: async (a, u) => {
        seen.push("stats", a, u);
        return null;
      },
      getSeries: async (a, u) => {
        seen.push("series", a, u);
        return [{ t: "2026-10-16T12:00:00.000Z", value: 0.4 }];
      },
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual(["stats", ATTEMPT, USER, "series", ATTEMPT, USER]);
  });

  it("503s when both stats and series are unavailable", async () => {
    const res = await handleDeviationAnalytics(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      getStats: async () => null,
      getSeries: async () => null,
    });
    expect(res.status).toBe(503);
  });

  it("returns stats and the downsampled series", async () => {
    const res = await handleDeviationAnalytics(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      getStats: async () => ({ p50: 0.4, p95: 0.5, max: 3.3, timeWeightedAvg: 0.43, sampleCount: 240 }),
      getSeries: async () => [{ t: "2026-10-16T12:00:00.000Z", value: 0.4 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stats: { p50: 0.4, p95: 0.5, max: 3.3, timeWeightedAvg: 0.43, sampleCount: 240 },
      series: [{ t: "2026-10-16T12:00:00.000Z", value: 0.4 }],
    });
  });

  it("429s before touching the database", async () => {
    let called = false;
    const res = await handleDeviationAnalytics(req(`http://local/x?attemptId=${ATTEMPT}&anonymousUserId=${USER}`), {
      rateLimiter: blockingLimiter,
      getStats: async () => {
        called = true;
        return null;
      },
      getSeries: async () => null,
    });
    expect(res.status).toBe(429);
    expect(called).toBe(false);
  });
});
