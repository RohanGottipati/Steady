// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleDeleteHistory, handleProgressRequest } from "@/lib/db/history-handlers";
import type { RateLimiter } from "@/lib/voice/rate-limit";

const USER = "11111111-1111-4111-8111-111111111111";
const base = "http://local/api/progress";

const blockingLimiter: RateLimiter = {
  check: () => ({ allowed: false, retryAfterMs: 5000 }),
  reset: () => {},
};

function get(query = `?anonymousUserId=${USER}`) {
  return new Request(`${base}${query}`);
}
function del(query = `?anonymousUserId=${USER}`) {
  return new Request(`http://local/api/attempts${query}`, { method: "DELETE" });
}

describe("GET /api/progress handler", () => {
  it("400s on a missing or malformed anonymousUserId", async () => {
    expect((await handleProgressRequest(get(""))).status).toBe(400);
    expect((await handleProgressRequest(get("?anonymousUserId=not-a-uuid"))).status).toBe(400);
  });

  it("503s when progress is unavailable (null)", async () => {
    const res = await handleProgressRequest(get(), { getProgress: async () => null });
    expect(res.status).toBe(503);
  });

  it("returns the progress payload when available", async () => {
    const res = await handleProgressRequest(get(), { getProgress: async () => [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progress: [] });
  });

  it("429s when rate limited before touching the database", async () => {
    let called = false;
    const res = await handleProgressRequest(get(), {
      rateLimiter: blockingLimiter,
      getProgress: async () => {
        called = true;
        return [];
      },
    });
    expect(res.status).toBe(429);
    expect(called).toBe(false);
  });
});

describe("DELETE /api/attempts handler", () => {
  it("400s on a missing or malformed anonymousUserId", async () => {
    expect((await handleDeleteHistory(del(""))).status).toBe(400);
    expect((await handleDeleteHistory(del("?anonymousUserId=nope"))).status).toBe(400);
  });

  it("503s when Tiger is unconfigured", async () => {
    const res = await handleDeleteHistory(del(), { deleteHistory: async () => "unconfigured" });
    expect(res.status).toBe(503);
  });

  it("502s when the delete write fails", async () => {
    const res = await handleDeleteHistory(del(), { deleteHistory: async () => "failed" });
    expect(res.status).toBe(502);
  });

  it("confirms deletion on success", async () => {
    const res = await handleDeleteHistory(del(), { deleteHistory: async () => "synced" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
  });

  it("429s when rate limited before touching the database", async () => {
    let called = false;
    const res = await handleDeleteHistory(del(), {
      rateLimiter: blockingLimiter,
      deleteHistory: async () => {
        called = true;
        return "synced";
      },
    });
    expect(res.status).toBe(429);
    expect(called).toBe(false);
  });
});
