import { beforeEach, describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import {
  adaptReferenceForAttempt,
  detectActiveSide,
  evaluateCompletedAttempt,
} from "@/lib/exercise/attempt-evaluator";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import {
  buildFixtureControlFrames,
  resolveFixtureIdFromSearch,
} from "@/lib/exercise/fixture-playback";
import { GhostPlaybackController } from "@/lib/exercise/ghost-playback";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import {
  NEEDLE_PASSING_RINGS,
  pointInBox,
  RELEASE_ZONE,
  TISSUE_WALL_ZONE,
} from "@/lib/exercise/needle-passing-config";
import { TIP_OFFSET, ToolSimulationController } from "@/lib/simulation/tool-simulation";
import {
  clearSavedAttempts,
} from "@/lib/storage/attempt-cache";
import type { ControlSnapshot, ToolControlTarget } from "@/lib/vision/control-types";
import {
  attemptResultSchema,
  PERFORMANCE_VECTOR_ORDER,
  savedAttemptSchema,
  type Quat,
  type Vec3,
} from "@/types";
import { identityQuat, makeHandFrame } from "../fixtures/contracts";

function targetForTip(
  side: "left" | "right",
  tip: Vec3,
  closed = false,
  rotation: Quat = identityQuat,
): ToolControlTarget {
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  const offset = new Vector3(TIP_OFFSET.x, TIP_OFFSET.y, TIP_OFFSET.z).applyQuaternion(q);
  return {
    id: side === "left" ? "left-tool" : "right-tool",
    position: { x: tip.x - offset.x, y: tip.y - offset.y, z: tip.z - offset.z },
    rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    jawClosed: closed,
  };
}

// Numerical fixture helper: product playback is owned exclusively by TrainingRuntime.
function playFixture(id: "needle-pass-good" | "needle-pass-late-rotation", simulation: ToolSimulationController, exercise: ExerciseController, ghost?: GhostPlaybackController) {
  for (const control of buildFixtureControlFrames(id, 1000)) {
    const now = control.sourceTMs!;
    const events = simulation.update(control, now);
    const snapshot = exercise.update(control, simulation.snapshot, events, now);
    ghost?.update(snapshot, 1 / 30);
  }
}

describe("S1 danger-zone geometry and attempt evaluator", () => {
  beforeEach(async () => {
    await clearSavedAttempts();
  });

  it("keeps needle and target rings outside the tissue-wall box", () => {
    for (const point of [{ x: 0, y: 0.35, z: 0 }, ...NEEDLE_PASSING_RINGS.map(ring => ring.position), RELEASE_ZONE.position]) {
      expect(pointInBox(point, TISSUE_WALL_ZONE)).toBe(false);
    }
    expect(pointInBox(TISSUE_WALL_ZONE.center, TISSUE_WALL_ZONE)).toBe(true);
  });

  it("completes needle-pass-good and needle-pass-late-rotation fixtures and orders their scores deterministically", () => {
    const runFixture = (fixtureId: "needle-pass-good" | "needle-pass-late-rotation") => {
      const sim = new ToolSimulationController({ assisted: true });
      const exercise = new ExerciseController({ skill: needlePassingSkill, mode: "practice" });
      const ghost = new GhostPlaybackController();
      playFixture(fixtureId, sim, exercise, ghost);
      expect(exercise.snapshot.phase).toBe("complete");
      expect(exercise.snapshot.segmentId).toBe("complete");
      expect(exercise.snapshot.readyForEvaluation).toBe(true);
      expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1", "ring-2", "ring-3"]);

      return evaluateCompletedAttempt({
        recorded: exercise.getRecordedMotion(),
        reference: ghost.getReference(),
        skill: needlePassingSkill,
        mode: "practice",
        attemptId: `test-${fixtureId}`,
      });
    };

    const good = runFixture("needle-pass-good");
    const late = runFixture("needle-pass-late-rotation");

    expect(() => attemptResultSchema.parse(good.attemptResult)).not.toThrow();
    expect(() => savedAttemptSchema.parse(good.savedAttempt)).not.toThrow();
    expect(good.evaluation.metrics.map(m => m.id)).toEqual([...PERFORMANCE_VECTOR_ORDER]);
    expect(good.evaluation.explanations).toHaveLength(20);

    // Clean pass stays clear of tissue-wall danger zone and completes all 8 segments in sequence
    expect(good.attemptResult.performance.dangerZoneAvoidance).toBe(100);
    expect(good.attemptResult.performance.proceduralSequencing).toBe(100);
    expect(late.attemptResult.performance.proceduralSequencing).toBe(100);

    // Good pass scores clearly higher than late-rotation pass on overall, orientation, rotation, and path
    expect(good.attemptResult.overallScore).toBeGreaterThan(80);
    expect(good.attemptResult.overallScore).toBeGreaterThan(late.attemptResult.overallScore + 8);
    expect(good.attemptResult.performance.instrumentOrientationAccuracy).toBeGreaterThan(
      late.attemptResult.performance.instrumentOrientationAccuracy + 25,
    );
    expect(good.attemptResult.performance.rotationControlAccuracy).toBeGreaterThan(
      late.attemptResult.performance.rotationControlAccuracy,
    );
    expect(good.attemptResult.performance.pathSimilarity).toBeGreaterThan(
      late.attemptResult.performance.pathSimilarity,
    );
    expect(late.attemptResult.worstMoments.length).toBeGreaterThan(0);


  });

  it("penalizes dangerZoneAvoidance when a recorded attempt dips into tissue-wall", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ skill: needlePassingSkill, mode: "practice" });
    playFixture("needle-pass-good", sim, exercise);

    const cleanRecorded = exercise.getRecordedMotion();
    const violatedRecorded = {
      ...cleanRecorded,
      frames: cleanRecorded.frames.map((frame, index) =>
        index % 2 === 0
          ? {
              ...frame,
              rightTool: {
                ...frame.rightTool,
                position: { ...TISSUE_WALL_ZONE.center },
                tipPosition: { ...TISSUE_WALL_ZONE.center },
              },
            }
          : frame,
      ),
    };

    const bundle = evaluateCompletedAttempt({
      recorded: violatedRecorded,
      reference: DEFAULT_NEEDLE_PASSING_REFERENCE,
      skill: needlePassingSkill,
      mode: "assessment",
    });

    expect(bundle.attemptResult.performance.dangerZoneAvoidance).toBeLessThan(100);
  });

  it("resolves fixture URLs, the environment default, and an explicit camera override", () => {
    expect(resolveFixtureIdFromSearch("?fixture=needle-pass-good")).toBe("needle-pass-good");
    expect(resolveFixtureIdFromSearch("?fixture=needle-pass-late-rotation")).toBe("needle-pass-late-rotation");
    expect(resolveFixtureIdFromSearch("", true)).toBe("needle-pass-good");
    expect(resolveFixtureIdFromSearch("?fixture=off", true)).toBeNull();
    expect(resolveFixtureIdFromSearch("?fixture=unknown", false)).toBeNull();
    expect(resolveFixtureIdFromSearch("", false)).toBeNull();
  });

  it("adapts reference comparison when the user completes Needle Passing with right-tool in 1-Hand Mode", () => {
    const sim = new ToolSimulationController({ assisted: true, singleHand: true });
    const exercise = new ExerciseController({ mode: "practice" });
    const leftFrames = buildFixtureControlFrames("needle-pass-good", 40);

    for (const frame of leftFrames) {
      const now = frame.sourceTMs!;
      // Recompute exact tip from left frame
      const q = new Quaternion(
        frame.left.target!.rotation.x,
        frame.left.target!.rotation.y,
        frame.left.target!.rotation.z,
        frame.left.target!.rotation.w,
      );
      const leftTip = new Vector3(TIP_OFFSET.x, TIP_OFFSET.y, TIP_OFFSET.z)
        .applyQuaternion(q)
        .add(
          new Vector3(
            frame.left.target!.position.x,
            frame.left.target!.position.y,
            frame.left.target!.position.z,
          ),
        );
      const exactRightTarget = targetForTip(
        "right",
        { x: leftTip.x, y: leftTip.y, z: leftTip.z },
        frame.left.target!.jawClosed,
        frame.left.target!.rotation,
      );

      const oneHandRightControl: ControlSnapshot = {
        sourceTMs: now,
        calibrated: true,
        canProgress: true,
        left: {
          status: "unavailable",
          lastSeenMs: null,
          hand: null,
          target: null,
          rotationHeld: false,
        },
        right: {
          status: "tracking",
          lastSeenMs: now,
          hand: makeHandFrame("Right"),
          target: exactRightTarget,
          rotationHeld: false,
        },
      };
      const events = sim.update(oneHandRightControl, now);
      exercise.update(oneHandRightControl, sim.snapshot, events, now);
    }

    expect(exercise.snapshot.phase).toBe("complete");
    const recorded = exercise.getRecordedMotion();
    expect(detectActiveSide(recorded)).toBe("right");

    const adapted = adaptReferenceForAttempt(DEFAULT_NEEDLE_PASSING_REFERENCE, recorded, {
      singleHand: true,
    });
    expect(adapted.frames[20].rightTool.jawClosed).toBe(true);

    const bundle = evaluateCompletedAttempt({
      recorded,
      reference: DEFAULT_NEEDLE_PASSING_REFERENCE,
      skill: needlePassingSkill,
      mode: "practice",
      singleHand: true,
    });
    expect(bundle.activeSide).toBe("right");
    expect(bundle.attemptResult.overallScore).toBeGreaterThan(80);
  });
});
