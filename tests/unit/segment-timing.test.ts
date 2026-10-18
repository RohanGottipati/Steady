import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "@/lib/evaluation/evaluate";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import type { MotionFrame, ReferenceMotion } from "@/types";

function reference(points: Array<[string, number]>): ReferenceMotion {
  return {
    ...structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE),
    frames: points.map(([segmentId, tMs]) => ({
      ...structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE.frames[0]), segmentId, tMs,
    })),
  };
}

function timing(ref: ReferenceMotion, frames: MotionFrame[]) {
  const result = evaluateAttempt({ skillId: ref.skillId, frames }, ref);
  return result.metrics.find(metric => metric.id === "segmentTiming")!;
}

const balanced = reference([["approach", 0], ["grip", 1000], ["complete", 2000]]);

describe("segment timing balance", () => {
  it("preserves full credit at a slower overall pace and with a timestamp offset", () => {
    const ref = DEFAULT_NEEDLE_PASSING_REFERENCE;
    const frames = ref.frames.map(frame => ({ ...frame, tMs: 7000 + frame.tMs * 10 }));
    expect(timing(ref, frames).score).toBe(100);
  });

  it("responds to uneven pacing rather than always returning zero", () => {
    const moderate = reference([["approach", 0], ["grip", 1500], ["complete", 2000]]);
    const extreme = reference([["approach", 0], ["grip", 1950], ["complete", 2000]]);
    const score = timing(balanced, moderate.frames);
    expect(score.rawValue).toBeCloseTo(0.25);
    expect(score.score).toBe(50);
    expect(timing(balanced, extreme.frames).score).toBeLessThan(score.score);
  });

  it("measures single-frame stages up to the next transition at any sampling rate", () => {
    const dense = reference([
      ["approach", 0], ["approach", 500], ["grip", 1000], ["grip", 1500], ["complete", 2000],
    ]);
    expect(timing(dense, balanced.frames).score).toBe(100);
  });

  it("sums repeated stage visits without counting time spent in intervening stages", () => {
    const repeated = reference([["approach", 0], ["grip", 1000], ["approach", 2000], ["complete", 3000]]);
    const user = reference([["approach", 0], ["grip", 500], ["approach", 2000], ["complete", 3000]]);
    expect(timing(repeated, user.frames).rawValue).toBeCloseTo(1 / 6);
  });

  it("accounts for missing or unexpected stages and handles recordings with no duration", () => {
    const missing = reference([["approach", 0], ["complete", 2000]]);
    const unexpected = reference([["unexpected", 0], ["complete", 2000]]);
    expect(timing(balanced, missing.frames).score).toBe(0);
    expect(timing(balanced, unexpected.frames).score).toBe(0);
    expect(timing(balanced, balanced.frames.slice(0, 1)).score).toBe(0);
  });

  it("explains timing as step balance rather than an absolute speed target", () => {
    const result = evaluateAttempt({ skillId: balanced.skillId, frames: balanced.frames }, balanced);
    expect(result.explanations.find(item => item.id === "segmentTiming")?.text).toContain("overall speed is not scored");
  });
});
