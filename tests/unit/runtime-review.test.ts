import { describe, expect, it, vi } from "vitest";
import type { AttemptReview } from "@/lib/ai/request-review";
import { buildDeterministicReview } from "@/lib/ai/deterministic-review";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { needlePassingSkill } from "@/data/skills/needle-passing";

const { requestReview } = vi.hoisted(() => ({ requestReview: vi.fn() }));
vi.mock("@/lib/ai/request-review", () => ({ requestAttemptReview: requestReview }));
vi.mock("@/lib/storage/attempt-cache", () => ({ saveCompletedAttempt: vi.fn(async () => "memory") }));
vi.mock("@/lib/storage/cloud-sync", () => ({ syncSavedAttempt: vi.fn(async () => "local-only") }));

function complete(runtime: TrainingRuntime) {
  for (const frame of buildFixtureControlFrames("needle-pass-good", 1000)) runtime.advance(frame, 1 / 30, frame.sourceTMs!);
  expect(runtime.bundle).not.toBeNull();
}

describe("session review ownership", () => {
  it("propagates one accepted review to results and replay without replacing scores", async () => {
    let resolve!: (review: AttemptReview) => void;
    requestReview.mockImplementationOnce(() => new Promise<AttemptReview>(done => { resolve = done; }));
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    complete(runtime);
    const score = runtime.bundle!.attemptResult.overallScore;
    const model = { ...buildDeterministicReview(runtime.bundle!), replayNarration: "Measured difference explained." };
    resolve({ source: "model", review: model, notice: null });
    await vi.waitFor(() => expect(runtime.review?.source).toBe("model"));
    expect(runtime.review?.review).toEqual(model);
    expect(runtime.lastReplay?.review?.replayNarration).toBe(model.replayNarration);
    expect(runtime.bundle!.attemptResult.overallScore).toBe(score);
  });

  it("ignores a response from before a reset, retaining the original replay", async () => {
    let resolve!: (review: AttemptReview) => void;
    requestReview.mockImplementationOnce(() => new Promise<AttemptReview>(done => { resolve = done; }));
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    complete(runtime);
    const model = { ...buildDeterministicReview(runtime.bundle!), replayNarration: "Obsolete review." };
    const replay = runtime.lastReplay;
    runtime.reset(true);
    resolve({ source: "model", review: model, notice: null });
    await Promise.resolve();
    expect(runtime.review).toBeNull();
    expect(runtime.lastReplay).toBe(replay);
    expect(runtime.lastReplay?.review?.replayNarration).not.toBe("Obsolete review.");
  });
});
