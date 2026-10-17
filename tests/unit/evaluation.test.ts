import { describe, expect, it } from "vitest";
import { evaluateAttempt } from "@/lib/evaluation/evaluate";
import type { EvaluationResult } from "@/lib/evaluation/types";
import {
  jitterAttempt,
  lateRotationAttempt,
  loadJigsawsExpertReference,
  loadNeedleReference,
  perfectAttempt,
  translatedAttempt,
  wrongSequenceAttempt,
} from "../fixtures/evaluation";

import { PERFORMANCE_VECTOR_ORDER } from "@/types/evaluation";

const ref = loadNeedleReference();
const score = (r: EvaluationResult, id: string) =>
  r.metrics.find((m) => m.id === id)?.score ?? NaN;

describe("evaluateAttempt", () => {
  const perfect = evaluateAttempt(perfectAttempt(ref), ref);

  it("implements the full 20-metric set in canonical order with 0-100 scores", () => {
    expect(perfect.metrics.map((m) => m.id)).toEqual([...PERFORMANCE_VECTOR_ORDER]);
    for (const m of perfect.metrics) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });

  it("populates every PerformanceVector field and an explanation per metric", () => {
    for (const id of PERFORMANCE_VECTOR_ORDER) {
      expect(perfect.performance[id]).toBeGreaterThanOrEqual(0);
      expect(perfect.performance[id]).toBeLessThanOrEqual(100);
    }
    expect(perfect.explanations.map((e) => e.id)).toEqual([...PERFORMANCE_VECTOR_ORDER]);
  });

  it("reports all five category scores", () => {
    expect(Object.keys(perfect.categoryScores).sort()).toEqual(
      ["control", "coordination", "efficiencySafety", "precision", "technique"].sort(),
    );
  });

  it("scores a perfect clone near the top", () => {
    expect(perfect.overallScore).toBeGreaterThan(95);
    expect(score(perfect, "pathSimilarity")).toBeGreaterThanOrEqual(99);
    expect(score(perfect, "instrumentOrientationAccuracy")).toBeGreaterThanOrEqual(99);
    expect(score(perfect, "proceduralSequencing")).toBe(100);
  });

  it("ranks every perturbation below the perfect clone overall", () => {
    for (const make of [translatedAttempt, lateRotationAttempt, jitterAttempt, wrongSequenceAttempt]) {
      expect(evaluateAttempt(make(ref), ref).overallScore).toBeLessThan(perfect.overallScore);
    }
  });

  it("translation lowers path/target but not orientation", () => {
    const t = evaluateAttempt(translatedAttempt(ref), ref);
    expect(score(t, "pathSimilarity")).toBeLessThan(score(perfect, "pathSimilarity"));
    expect(score(t, "targetAccuracy")).toBeLessThan(score(perfect, "targetAccuracy"));
    expect(score(t, "instrumentOrientationAccuracy")).toBeGreaterThanOrEqual(
      score(perfect, "instrumentOrientationAccuracy") - 1,
    );
  });

  it("late rotation specifically lowers orientation accuracy", () => {
    const lr = evaluateAttempt(lateRotationAttempt(ref), ref);
    expect(score(lr, "instrumentOrientationAccuracy")).toBeLessThan(
      score(perfect, "instrumentOrientationAccuracy"),
    );
    expect(score(lr, "pathSimilarity")).toBeGreaterThanOrEqual(
      score(perfect, "pathSimilarity") - 1,
    );
  });

  it("jitter lowers smoothness", () => {
    const j = evaluateAttempt(jitterAttempt(ref), ref);
    expect(score(j, "movementSmoothness")).toBeLessThan(score(perfect, "movementSmoothness"));
  });

  it("wrong sequencing lowers procedural sequencing", () => {
    const w = evaluateAttempt(wrongSequenceAttempt(ref), ref);
    expect(score(w, "proceduralSequencing")).toBeLessThan(100);
  });

  it("procedural sequencing scores a perfect clone of a gesture-repeating reference at 100", () => {
    // Real JIGSAWS references revisit gestures (e.g. four needle passes); the
    // run-collapsed-LCS metric must not penalize a perfect clone for that.
    const jig = loadJigsawsExpertReference("needle-passing");
    expect(jig.segments.length).toBeGreaterThan(new Set(jig.segments.map((s) => s.id)).size);
    const p = evaluateAttempt(perfectAttempt(jig), jig);
    expect(score(p, "proceduralSequencing")).toBe(100);
  });

  it("overshoot control scores a perfect clone of a curved expert reference near 100", () => {
    // Curved JIGSAWS expert trajectories naturally oscillate distance-to-endpoint;
    // the metric must score excess over the reference's own reversals, so a clone
    // inherits no penalty.
    const jig = loadJigsawsExpertReference("needle-passing");
    const p = evaluateAttempt(perfectAttempt(jig), jig);
    expect(score(p, "overshootControl")).toBeGreaterThanOrEqual(99);
  });

  it("is deterministic", () => {
    const a = evaluateAttempt(translatedAttempt(ref), ref);
    const b = evaluateAttempt(translatedAttempt(ref), ref);
    expect(a).toEqual(b);
  });

  it("emits up to three worst-moment replay markers", () => {
    const t = evaluateAttempt(translatedAttempt(ref), ref);
    expect(t.worstMoments.length).toBeGreaterThan(0);
    expect(t.worstMoments.length).toBeLessThanOrEqual(3);
    for (const m of t.worstMoments) {
      expect(m.severity).toBeGreaterThanOrEqual(0);
      expect(m.severity).toBeLessThanOrEqual(1);
    }
  });
});
