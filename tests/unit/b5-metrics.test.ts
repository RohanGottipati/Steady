import { describe, expect, it } from "vitest";
import { evaluateAttempt, toAttemptResult } from "@/lib/evaluation/evaluate";
import type { EvaluationResult } from "@/lib/evaluation/types";
import { attemptResultSchema } from "@/types/attempt";
import {
  DANGER_ZONE,
  bimanualDesyncAttempt,
  collisionAttempt,
  depthDriftAttempt,
  deviateAndRecoverAttempt,
  enterDangerZoneAttempt,
  idleAttempt,
  lateGripAttempt,
  lateRotationAttempt,
  loadNeedleReference,
  overshootAttempt,
  perfectAttempt,
  translatedAttempt,
  unstableGripAttempt,
  wideWorkspaceAttempt,
} from "../fixtures/evaluation";

const ref = loadNeedleReference();
const score = (r: EvaluationResult, id: string) =>
  r.metrics.find((m) => m.id === id)?.score ?? NaN;

const perfect = evaluateAttempt(perfectAttempt(ref), ref);

describe("B5 new metrics — each perturbation lowers its target metric", () => {
  it("depth drift lowers depthConsistency; pure XY translation does not", () => {
    expect(score(evaluateAttempt(depthDriftAttempt(ref), ref), "depthConsistency")).toBeLessThan(
      score(perfect, "depthConsistency"),
    );
    expect(
      score(evaluateAttempt(translatedAttempt(ref), ref), "depthConsistency"),
    ).toBeGreaterThanOrEqual(score(perfect, "depthConsistency") - 1);
  });

  it("an off-path excursion lowers correctionEfficiency", () => {
    expect(
      score(evaluateAttempt(deviateAndRecoverAttempt(ref), ref), "correctionEfficiency"),
    ).toBeLessThan(score(perfect, "correctionEfficiency"));
  });

  it("oscillation lowers overshootControl", () => {
    expect(score(evaluateAttempt(overshootAttempt(ref), ref), "overshootControl")).toBeLessThan(
      score(perfect, "overshootControl"),
    );
  });

  it("jitter lowers motionStability", () => {
    // deviateAndRecover is smooth within its halves; oscillation is the wobble case
    expect(score(evaluateAttempt(overshootAttempt(ref), ref), "motionStability")).toBeLessThan(
      score(perfect, "motionStability"),
    );
  });

  it("failing to rotate lowers rotationControlAccuracy", () => {
    expect(
      score(evaluateAttempt(lateRotationAttempt(ref), ref), "rotationControlAccuracy"),
    ).toBeLessThan(score(perfect, "rotationControlAccuracy"));
  });

  it("grip chatter lowers pinchStability", () => {
    expect(score(evaluateAttempt(unstableGripAttempt(ref), ref), "pinchStability")).toBeLessThan(
      score(perfect, "pinchStability"),
    );
  });

  it("shifted grip timeline lowers gripTiming", () => {
    expect(score(evaluateAttempt(lateGripAttempt(ref), ref), "gripTiming")).toBeLessThan(
      score(perfect, "gripTiming"),
    );
  });

  it("an oversized workspace lowers handWorkspaceControl; a constant offset does not", () => {
    expect(
      score(evaluateAttempt(wideWorkspaceAttempt(ref), ref), "handWorkspaceControl"),
    ).toBeLessThan(score(perfect, "handWorkspaceControl"));
    expect(
      score(evaluateAttempt(translatedAttempt(ref), ref), "handWorkspaceControl"),
    ).toBeGreaterThanOrEqual(score(perfect, "handWorkspaceControl") - 1);
  });

  it("desyncing one hand lowers bimanualCoordination; moving both equally does not", () => {
    expect(
      score(evaluateAttempt(bimanualDesyncAttempt(ref), ref), "bimanualCoordination"),
    ).toBeLessThan(score(perfect, "bimanualCoordination"));
    expect(
      score(evaluateAttempt(translatedAttempt(ref), ref), "bimanualCoordination"),
    ).toBeGreaterThanOrEqual(score(perfect, "bimanualCoordination") - 1);
  });

  it("stationary dwell lowers idleTimeControl", () => {
    expect(score(evaluateAttempt(idleAttempt(ref), ref), "idleTimeControl")).toBeLessThan(
      score(perfect, "idleTimeControl"),
    );
  });

  it("bringing tips together lowers toolCollisionAvoidance", () => {
    expect(
      score(evaluateAttempt(collisionAttempt(ref), ref), "toolCollisionAvoidance"),
    ).toBeLessThan(score(perfect, "toolCollisionAvoidance"));
  });

  it("dangerZoneAvoidance is 100 with no zones, lower when a zone is entered", () => {
    expect(score(perfect, "dangerZoneAvoidance")).toBe(100);
    const entered = evaluateAttempt(enterDangerZoneAttempt(ref), ref, {
      scene: { dangerZones: [DANGER_ZONE] },
    });
    expect(score(entered, "dangerZoneAvoidance")).toBeLessThan(100);
  });
});

describe("B5 aggregation", () => {
  it("a perfect clone scores at or near the top across all metrics", () => {
    expect(perfect.overallScore).toBeGreaterThan(95);
  });

  it("skill-specific weights change the overall score", () => {
    const attempt = depthDriftAttempt(ref);
    const equal = evaluateAttempt(attempt, ref).overallScore;
    const depthHeavy = evaluateAttempt(attempt, ref, {
      metricWeights: { depthConsistency: 50 },
    }).overallScore;
    // depth is the damaged metric, so weighting it heavily must drag overall down
    expect(depthHeavy).toBeLessThan(equal);
  });

  it("is deterministic", () => {
    expect(evaluateAttempt(overshootAttempt(ref), ref)).toEqual(
      evaluateAttempt(overshootAttempt(ref), ref),
    );
  });
});

describe("B5 toAttemptResult", () => {
  it("assembles a schema-valid AttemptResult from an evaluation + session metadata", () => {
    const evaluation = evaluateAttempt(perfectAttempt(ref), ref);
    const result = toAttemptResult(evaluation, {
      id: "attempt-1",
      skillId: ref.skillId,
      mode: "assessment",
      createdAt: "2026-10-17T00:00:00.000Z",
      durationMs: 6000,
      referenceMotionId: ref.id,
      importantEvents: [],
    });
    expect(() => attemptResultSchema.parse(result)).not.toThrow();
    expect(result.performance).toEqual(evaluation.performance);
    expect(result.overallScore).toBe(evaluation.overallScore);
  });
});
