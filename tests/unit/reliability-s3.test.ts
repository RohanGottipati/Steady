import { describe, expect, it, vi } from "vitest";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { CoachingSignals } from "@/lib/coaching/coaching-engine";
import { requestAttemptReview } from "@/lib/ai/request-review";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import { isRecoverableRejection } from "@/lib/reliability/failures";

const syncSavedAttempt = vi.hoisted(() => vi.fn(async (attempt: { result: { id: string } }) => {
  void attempt;
  return "local-only" as const;
}));
vi.mock("@/lib/storage/attempt-cache", () => ({
  saveCompletedAttempt: vi.fn(async () => "indexeddb"),
}));
vi.mock("@/lib/storage/cloud-sync", () => ({
  syncSavedAttempt,
  retryUnsyncedAttempts: vi.fn(async () => {}),
}));

function speakOnce(runtime: TrainingRuntime, text: string, type: "overshoot" | "path_deviation") {
  const original = runtime.coaching.evaluate.bind(runtime.coaching);
  let sent = false;
  vi.spyOn(runtime.coaching, "evaluate").mockImplementation((signals: CoachingSignals) => {
    const tick = original(signals);
    if (sent) return tick;
    sent = true;
    return {
      ...tick,
      spoken: {
        text,
        event: { id: "e1", tMs: signals.tMs, type, severity: 1, segmentId: signals.segmentId, data: {} },
      },
    };
  });
}

describe("S3 training degradation", () => {
  it("keeps an in-progress fixture going when speech throws and does not upload it", () => {
    syncSavedAttempt.mockClear();
    const runtime = new TrainingRuntime(needlePassingSkill, "learn");
    runtime.configure("learn", "needle-pass-good", false, true);
    const live: boolean[] = [];
    runtime.attachSpeaker((_type, allowLive) => {
      live.push(allowLive);
      throw new Error("speech synthesis failed");
    });
    speakOnce(runtime, "You moved past the target — correct gently.", "overshoot");
    expect(() => runtime.advance(runtime.controls, 1 / 30, 100)).not.toThrow();
    expect(runtime.bundle).toBeNull();
    expect(runtime.error).toBeNull();
    expect(runtime.message).toContain("moved past the target");
    expect(live).toEqual([false]);
    expect(syncSavedAttempt).not.toHaveBeenCalled();
  });

  it("finishes a webcam attempt when speech and cloud sync both fail", async () => {
    syncSavedAttempt.mockReset();
    syncSavedAttempt.mockRejectedValue(new Error("failed to fetch"));
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    const live: boolean[] = [];
    runtime.attachSpeaker((_type, allowLive) => {
      live.push(allowLive);
      throw new Error("speech synthesis failed");
    });
    speakOnce(runtime, "Return toward the highlighted path.", "path_deviation");
    const frame = buildFixtureControlFrames("needle-pass-good", 1000)[0];
    expect(() => runtime.advance(frame, 1 / 30, frame.sourceTMs!)).not.toThrow();
    expect(runtime.bundle).toBeNull();
    expect(runtime.error).toBeNull();
    expect(live[0]).toBe(true);
    expect(runtime.message).toContain("highlighted path");
    for (const next of buildFixtureControlFrames("needle-pass-good", 1000)) {
      runtime.advance(next, 1 / 30, next.sourceTMs!);
    }
    expect(runtime.bundle?.attemptResult.overallScore).toEqual(expect.any(Number));
    await vi.waitFor(() => expect(runtime.cloudStatus).toBe("local-only"));
    expect(runtime.saveStatus).toBe("indexeddb");
    expect(syncSavedAttempt).toHaveBeenCalledTimes(1);
    const uploaded = syncSavedAttempt.mock.calls[0]?.[0]?.result.id;
    runtime.retryCloudSync();
    expect(syncSavedAttempt).toHaveBeenCalledTimes(2);
    expect(syncSavedAttempt.mock.calls[1]?.[0]?.result.id).toBe(uploaded);
  });
});

describe("S3 review fallback", () => {
  it("keeps the deterministic summary when AI review fails", async () => {
    const bundle = evaluateCompletedAttempt({
      recorded: { skillId: "needle-passing", frames: structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE.frames) },
    });
    const score = bundle.attemptResult.overallScore;
    const fetchFn = vi.fn(async () => { throw new Error("Failed to fetch"); });
    const review = await requestAttemptReview(bundle, { fetchFn: fetchFn as typeof fetch });
    expect(review.source).toBe("deterministic");
    expect(review.notice).toMatch(/unavailable/i);
    expect(review.review.summary).toContain(String(score));
    expect(bundle.attemptResult.overallScore).toBe(score);
    expect(review.review).not.toHaveProperty("overallScore");
  });

  it("classifies network and speech failures as recoverable", () => {
    expect(isRecoverableRejection(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRecoverableRejection(new Error("speech synthesis failed"))).toBe(true);
    expect(isRecoverableRejection(new Error("The attempt could not be evaluated."))).toBe(false);
    expect(isRecoverableRejection("offline")).toBe(false);
  });
});

describe("S3 repeated fixture sessions", () => {
  it("completes ten fixture attempts without a cloud sync or a thrown speech error", () => {
    syncSavedAttempt.mockClear();
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    runtime.attachSpeaker(() => { throw new Error("speech synthesis failed"); });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      runtime.configure("practice", "needle-pass-good", false, true);
      for (let step = 0; step < 60 * 12 && !runtime.bundle && !runtime.error; step += 1) {
        runtime.advance(runtime.controls, 1 / 60, step * 1000 / 60);
      }
      expect(runtime.error).toBeNull();
      expect(runtime.bundle?.attemptResult.overallScore).toBeGreaterThan(0);
      expect(runtime.saveStatus).toBe("demo");
      runtime.reset();
    }
    expect(syncSavedAttempt).not.toHaveBeenCalled();
  });
});
