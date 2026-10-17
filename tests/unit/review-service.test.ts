// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requestBackboardReview } from "@/lib/ai/backboard-review";
import { requestAttemptReview, reviewRequestFromBundle } from "@/lib/ai/request-review";
import { handleReviewRequest } from "@/lib/ai/review-handler";
import { buildDeterministicReview } from "@/lib/ai/deterministic-review";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import { selectFocusMarker } from "@/lib/evaluation/focus-marker";

function fixture() {
  const bundle = evaluateCompletedAttempt({ recorded: {
    skillId: "needle-passing", frames: structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE.frames),
  } });
  bundle.attemptResult.worstMoments = [{ tMs: 1000, segmentId: "rotation", metricId: "rotationControlAccuracy",
    severity: 0.9, explanationData: { orientationErrorDeg: 12 } }];
  return bundle;
}

describe("live review dependency", () => {
  it("sends only measured evidence with documented authentication and memory disabled", async () => {
    const bundle = fixture();
    const request = reviewRequestFromBundle(bundle);
    const review = buildDeterministicReview(bundle);
    const fetchFn = vi.fn(async () => Response.json({ status: "COMPLETED", content: JSON.stringify(review) }));
    expect(await requestBackboardReview(request, { fetchFn: fetchFn as typeof fetch, env: { BACKBOARD_API_KEY: "test-key" } })).toEqual(review);
    const [url, options] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.backboard.io/api/threads/messages");
    expect(options.headers).toMatchObject({ "X-API-Key": "test-key" });
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({ memory: "off", web_search: "off", json_output: true, model_name: "gemini-2.5-flash" });
    expect(body.system_prompt).toContain("largestDifference");
    const content = JSON.parse(body.content);
    expect(content.focusMarker).toEqual(selectFocusMarker(request.worstMoments));
    expect(content.focusMarker.explanationData.orientationErrorDeg).toBe(12);
    expect(content.measurements.metrics).toHaveLength(20);
    expect(body.content).not.toMatch(/landmarks|userReplayFrames/);
  });

  it("accepts a model review without changing deterministic scores", async () => {
    const bundle = fixture();
    const before = structuredClone(bundle.attemptResult);
    const review = { ...buildDeterministicReview(bundle), summary: "Measured rotation needs attention." };
    const result = await requestAttemptReview(bundle, { enabled: true,
      fetchFn: vi.fn(async () => Response.json(review)) as typeof fetch });
    expect(result).toEqual({ source: "model", review, notice: null });
    expect(bundle.attemptResult).toEqual(before);
  });

  it.each(["malformed", "wrong-focus", "network", "failed-status"])("keeps deterministic notes on %s", async failure => {
    const bundle = fixture();
    const review = buildDeterministicReview(bundle);
    const fetchFn = vi.fn(async () => {
      if (failure === "network") throw new Error("offline");
      if (failure === "malformed") return Response.json({ summary: "incomplete" });
      if (failure === "failed-status") return Response.json({ status: "FAILED", content: JSON.stringify(review) });
      return Response.json({ ...review, largestDifference: { segmentId: "other", explanation: "wrong moment" } });
    });
    if (failure === "failed-status") {
      await expect(requestBackboardReview(reviewRequestFromBundle(bundle), {
        fetchFn: fetchFn as typeof fetch, env: { BACKBOARD_API_KEY: "test-key" },
      })).rejects.toThrow(/complete/);
    } else {
      expect(await requestAttemptReview(bundle, { fetchFn: fetchFn as typeof fetch, enabled: true }))
        .toMatchObject({ source: "deterministic", review, notice: expect.stringContaining("unavailable") });
    }
  });

  it("does not call a provider when disabled, and rejects invalid route input", async () => {
    const fetchFn = vi.fn();
    const bundle = fixture();
    expect((await requestAttemptReview(bundle, { fetchFn, enabled: false })).source).toBe("deterministic");
    const disabled = await handleReviewRequest(new Request("http://local/api/review", { method: "POST" }), { env: {}, fetchFn });
    expect(disabled.status).toBe(503);
    const bad = await handleReviewRequest(new Request("http://local/api/review", { method: "POST", body: "{}" }), {
      env: { BACKBOARD_API_KEY: "test-key" }, fetchFn,
    });
    expect(bad.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
