// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleReviewRequest, MAX_REVIEW_BODY_BYTES } from "@/lib/ai/review-handler";
import { handleAttemptUpload, MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_EVENTS, MAX_UPLOAD_MARKERS, MAX_UPLOAD_SAMPLES } from "@/lib/db/attempt-upload-handler";
import { createRateLimiter } from "@/lib/voice/rate-limit";
import { buildAttemptUpload } from "@/lib/storage/cloud-sync";
import { sampleAttemptResult } from "../fixtures/contracts";

const review = {
  skillId: "needle-passing", mode: "practice", overallScore: 80,
  categoryScores: sampleAttemptResult.categoryScores,
  strongest: { id: "pathSimilarity", score: 90, explanation: "Close to guide." },
  weakest: { id: "gripTiming", score: 50, explanation: "Grip was late." },
  metrics: [], worstMoments: [],
};
function upload() {
  return buildAttemptUpload({
    result: { ...structuredClone(sampleAttemptResult), id: "11111111-1111-4111-8111-111111111111" },
    userReplayFrames: [], cloudSyncStatus: "pending",
  }, "00000000-0000-7000-8000-000000000001")!;
}
function request(body: unknown, ip = "192.0.2.1") {
  return new Request("http://local/api", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } });
}

describe("public route limits", () => {
  it.each(["review", "attempts"])("limits %s per IP before reading the body or calling a service", async route => {
    const rateLimiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const fetchFn = vi.fn(async () => { throw new Error("provider offline"); });
    const getDb = vi.fn(() => null);
    const persist = vi.fn();
    const run = (req: Request) => route === "review"
      ? handleReviewRequest(req, { env: { BACKBOARD_API_KEY: "test" }, fetchFn, rateLimiter })
      : handleAttemptUpload(req, { getDb, persist, rateLimiter });
    await run(request(route === "review" ? review : upload()));
    const blocked = request({});
    const read = vi.spyOn(blocked, "body", "get");
    const response = await run(blocked);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(read).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(route === "review" ? 1 : 0);
    expect(getDb).toHaveBeenCalledTimes(route === "attempts" ? 1 : 0);
    expect(persist).not.toHaveBeenCalled();
    expect((await run(request({}, "192.0.2.2"))).status).toBe(400);
  });

  it.each(["review", "attempts"])("bounds streamed and declared %s body sizes before external access", async route => {
    const limit = route === "review" ? MAX_REVIEW_BODY_BYTES : MAX_UPLOAD_BODY_BYTES;
    for (const declared of [false, true]) {
      const fetchFn = vi.fn();
      const getDb = vi.fn();
      const persist = vi.fn();
      // Multibyte input verifies a byte cap rather than a character-count cap.
      const body = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('"' + "é".repeat(limit / 2) + '"'));
        controller.close();
      } });
      const req = new Request("http://local/api", { method: "POST", body,
        headers: declared ? { "content-length": String(limit + 2) } : {}, duplex: "half",
      } as RequestInit);
      const response = route === "review"
        ? await handleReviewRequest(req, { env: { BACKBOARD_API_KEY: "test" }, fetchFn })
        : await handleAttemptUpload(req, { getDb, persist });
      expect(response.status).toBe(413);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(getDb).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    }
  });

  it.each(["strongest", "weakest", "metrics", "worstMoments"])("bounds review %s text before provider access", async field => {
    const text = "x".repeat(2001);
    const body = { ...review,
      ...(field === "strongest" || field === "weakest" ? { [field]: { ...review.strongest, explanation: text } } : {}),
      ...(field === "metrics" ? { metrics: [{ id: "pathSimilarity", score: 50, rawValue: 1, explanation: text }] } : {}),
      ...(field === "worstMoments" ? { worstMoments: [{ tMs: 1, segmentId: "grip", metricId: "gripTiming", severity: 1, explanationData: { text } }] } : {}),
    };
    const fetchFn = vi.fn();
    expect((await handleReviewRequest(request(body), { env: { BACKBOARD_API_KEY: "test" }, fetchFn })).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["motionSamples", "metricSamples", "coachingEvents", "importantEvents", "worstMoments"])("rejects oversized %s before database access", async field => {
    const body = upload();
    const event = { id: "event", tMs: 1, type: "overshoot" as const, severity: 1, segmentId: "grip", data: {} };
    if (field === "motionSamples") body.motionSamples = Array.from({ length: MAX_UPLOAD_SAMPLES + 1 }, () => ({ sampledAt: "2026-10-17", seq: 0, segment: "grip" }));
    if (field === "metricSamples") body.metricSamples = Array.from({ length: MAX_UPLOAD_SAMPLES + 1 }, () => ({ sampledAt: "2026-10-17", seq: 0, segment: "grip" }));
    if (field === "coachingEvents") body.coachingEvents = Array(MAX_UPLOAD_EVENTS + 1).fill(event);
    if (field === "importantEvents") body.attempt.result.importantEvents = Array(MAX_UPLOAD_EVENTS + 1).fill(event);
    if (field === "worstMoments") body.attempt.result.worstMoments = Array(MAX_UPLOAD_MARKERS + 1).fill({ tMs: 1, segmentId: "grip", metricId: "gripTiming", severity: 1, explanationData: {} });
    const getDb = vi.fn();
    const persist = vi.fn();
    expect((await handleAttemptUpload(request(body), { getDb, persist })).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
