import { describe, expect, it, vi } from "vitest";
import { handleReviewRequest } from "@/lib/ai/review-handler";
import { handleAttemptUpload } from "@/lib/db/attempt-upload-handler";
import { persistUploadedAttempt } from "@/lib/db/persist-attempt";
import { buildAttemptUpload } from "@/lib/storage/cloud-sync";
import { attemptUploadPayloadSchema, type AttemptUploadPayload } from "@/types/attempt";
import { sampleAttemptResult } from "../fixtures/contracts";

const USER = "00000000-0000-7000-8000-000000000001";
const reviewBody = {
  skillId: "needle-passing",
  mode: "practice",
  overallScore: 81,
  categoryScores: { precision: 80, control: 80, technique: 80, coordination: 80, efficiencySafety: 80 },
  strongest: { id: "pathSimilarity", score: 90, explanation: "Path stayed close." },
  weakest: { id: "rotationControlAccuracy", score: 40, explanation: "Rotation lagged the reference." },
  metrics: [],
  worstMoments: [],
};

const attemptId = "11111111-1111-4111-8111-111111111111";

function saved() {
  return {
    result: { ...sampleAttemptResult, id: attemptId },
    userReplayFrames: [],
    cloudSyncStatus: "pending" as const,
  };
}

function compact() {
  const payload = buildAttemptUpload(saved());
  if (!payload) throw new Error("fixture attempt did not build an upload");
  return payload;
}

function fullUpload(): AttemptUploadPayload {
  const result = saved().result;
  return attemptUploadPayloadSchema.parse({
    attempt: {
      id: result.id,
      anonymousUserId: USER,
      skillId: result.skillId,
      mode: result.mode,
      startedAt: "2026-10-16T00:00:00.000Z",
      completedAt: result.createdAt,
      durationMs: result.durationMs,
      result,
    },
    motionSamples: [],
    metricSamples: [],
    coachingEvents: [],
  });
}

describe("POST /api/attempts", () => {
  it("stays local when Tiger is unconfigured or the write throws", async () => {
    const body = JSON.stringify(compact());
    const unconfigured = await handleAttemptUpload(new Request("http://local/api/attempts", { method: "POST", body }), {
      getDb: () => null,
      persist: vi.fn(),
    });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toMatchObject({ db: "unconfigured" });
    const down = await handleAttemptUpload(new Request("http://local/api/attempts", { method: "POST", body }), {
      getDb: () => ({ begin: async () => { throw new Error("connection refused"); } }) as never,
      persist: async () => { throw new Error("connection refused"); },
    });
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ db: "down" });
  });

  it("reports a repeated id as a duplicate instead of a second attempt", async () => {
    const queries: string[] = [];
    let inserts = 0;
    const tx = Object.assign((strings: TemplateStringsArray) => {
      const text = strings.join(" ");
      queries.push(text);
      if (text.includes("insert into attempts")) {
        inserts += 1;
        return Promise.resolve(inserts === 1 ? [{ id: "once" }] : []);
      }
      return Promise.resolve([]);
    }, { json: (value: unknown) => value });
    const sql = { begin: (fn: (query: typeof tx) => Promise<"synced" | "duplicate">) => fn(tx), json: tx.json };
    const payload = fullUpload();
    await expect(persistUploadedAttempt(sql as never, payload)).resolves.toBe("synced");
    await expect(persistUploadedAttempt(sql as never, payload)).resolves.toBe("duplicate");
    const statement = queries.join("\n");
    expect(statement).toContain("on conflict (id) do nothing");
    expect(statement).toContain("where not exists");
    expect(queries.filter(query => query.includes("insert into attempt_scores"))).toHaveLength(1);
    expect(statement).not.toMatch(/landmark|webcam/i);

    const response = await handleAttemptUpload(new Request("http://local/api/attempts", { method: "POST", body: JSON.stringify(compact()) }), {
      getDb: () => sql as never,
      persist: async () => "duplicate",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "duplicate" });
  });

  it("rejects a malformed body without writing", async () => {
    const persist = vi.fn();
    const response = await handleAttemptUpload(new Request("http://local/api/attempts", { method: "POST", body: "{}" }), {
      getDb: () => ({}) as never,
      persist,
    });
    expect(response.status).toBe(400);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects mismatching attempt identities before any database access", async () => {
    const payload = fullUpload();
    payload.attempt.result.id = "22222222-2222-4222-8222-222222222222";
    const getDb = vi.fn();
    const response = await handleAttemptUpload(new Request("http://local/api/attempts", {
      method: "POST", body: JSON.stringify(payload),
    }), { getDb, persist: vi.fn() });
    expect(response.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("registers Peg Transfer metadata before persisting its result", async () => {
    const payload = fullUpload();
    payload.attempt.skillId = payload.attempt.result.skillId = "peg-transfer";
    const queries: { text: string; values: unknown[] }[] = [];
    const tx = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(" "); queries.push({ text, values });
      return text.includes("insert into attempts") ? [{ id: payload.attempt.id }] : [];
    }, { json: (value: unknown) => value });
    const sql = { begin: (fn: (query: typeof tx) => Promise<unknown>) => fn(tx) };
    await expect(persistUploadedAttempt(sql as never, payload)).resolves.toBe("synced");
    expect(queries[0].text).toContain("insert into skills");
    expect(queries[0].values).toContain("peg-transfer");
    expect(queries.filter(query => query.text.includes("insert into attempt_scores"))).toHaveLength(1);
  });
});

describe("POST /api/review", () => {
  it("fails closed without a score when Backboard is missing or the network throws", async () => {
    const missing = await handleReviewRequest(new Request("http://local/api/review", { method: "POST", body: "{}" }), { env: {} });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: "review unavailable", persistence: "deterministic" });

    const failed = await handleReviewRequest(new Request("http://local/api/review", {
      method: "POST",
      body: JSON.stringify(reviewBody),
    }), {
      env: { BACKBOARD_API_KEY: "test-key" },
      fetchFn: async () => { throw new Error("Failed to fetch"); },
    });
    expect(failed.status).toBe(503);
    const body = await failed.json();
    expect(body).toEqual({ error: "review unavailable", persistence: "deterministic" });
    expect(body).not.toHaveProperty("overallScore");
  });
});
