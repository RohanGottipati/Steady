import { describe, expect, it } from "vitest";
import { buildDeterministicReview } from "@/lib/ai/deterministic-review";
import { evaluateCompletedAttempt, type CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import { aiReviewSchema } from "@/types";
import { loadNeedleReference, perfectAttempt, translatedAttempt } from "../fixtures/evaluation";

const reference = loadNeedleReference();

function bundleFor(recorded: ReturnType<typeof perfectAttempt>): CompletedAttemptBundle {
  return evaluateCompletedAttempt({ recorded, reference, mode: "practice" });
}

describe("buildDeterministicReview", () => {
  it("produces a schema-valid AiReview for a perturbed attempt", () => {
    const review = buildDeterministicReview(bundleFor(translatedAttempt(reference)));
    // Validates against the exact contract B9's Backboard review must satisfy.
    expect(() => aiReviewSchema.parse(review)).not.toThrow();
    expect(review.strengths.length).toBeGreaterThanOrEqual(1);
    expect(review.strengths.length).toBeLessThanOrEqual(3);
    expect(review.improvements.length).toBeGreaterThanOrEqual(1);
    expect(review.improvements.length).toBeLessThanOrEqual(3);
  });

  it("names the weakest metric's evidence in the improvements", () => {
    const bundle = bundleFor(translatedAttempt(reference));
    const review = buildDeterministicReview(bundle);
    // Grounded, not invented: the weakest metric's factual explanation drives the top improvement.
    expect(review.improvements[0]).toContain(bundle.weakestMetric.explanation);
  });

  it("uses the top worst-moment segment as the largest difference", () => {
    const bundle = bundleFor(translatedAttempt(reference));
    expect(bundle.attemptResult.worstMoments.length).toBeGreaterThan(0);
    const review = buildDeterministicReview(bundle);
    expect(review.largestDifference.segmentId).toBe(bundle.attemptResult.worstMoments[0].segmentId);
  });

  it("stays schema-valid for a perfect attempt with no worst moments", () => {
    const bundle = bundleFor(perfectAttempt(reference));
    expect(bundle.attemptResult.worstMoments.length).toBe(0);
    const review = buildDeterministicReview(bundle);
    expect(() => aiReviewSchema.parse(review)).not.toThrow();
    expect(review.improvements.length).toBeGreaterThanOrEqual(1);
    expect(review.largestDifference.segmentId.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same attempt", () => {
    const bundle = bundleFor(translatedAttempt(reference));
    expect(buildDeterministicReview(bundle)).toEqual(buildDeterministicReview(bundle));
  });
});
