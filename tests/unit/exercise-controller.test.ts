import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { evaluateAttempt } from "@/lib/evaluation/evaluate";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import {
  corridorArcPoint,
  corridorMetrics,
  NEEDLE_PASSING_RINGS,
  pointInBox,
  RELEASE_ZONE,
  TISSUE_WALL_ZONE,
  validateSkillSceneConfig,
} from "@/lib/exercise/needle-passing-config";
import { TIP_OFFSET, ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { emptyControlSnapshot, type ControlSnapshot, type ToolControlTarget } from "@/lib/vision/control-types";
import { motionFrameSchema, type Quat, type Vec3 } from "@/types";
import { identityQuat, makeHandFrame } from "../fixtures/contracts";
import { loadNeedleReference } from "../fixtures/evaluation";

function zQuat(deg: number): Quat {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** Construct a ToolControlTarget whose tipPosition lands at `tip` for the given rotation. */
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

function makeControls(
  tMs: number,
  leftTip: Vec3 = { x: -0.5, y: 0.35, z: 0 },
  leftClosed = false,
  leftRot: Quat = identityQuat,
  rightTip: Vec3 = { x: 0.5, y: 0.35, z: 0 },
  rightClosed = false,
  rightRot: Quat = identityQuat,
): ControlSnapshot {
  return {
    sourceTMs: tMs,
    calibrated: true,
    canProgress: true,
    left: {
      status: "tracking",
      lastSeenMs: tMs,
      hand: makeHandFrame("Left"),
      target: targetForTip("left", leftTip, leftClosed, leftRot),
      rotationHeld: false,
    },
    right: {
      status: "tracking",
      lastSeenMs: tMs,
      hand: makeHandFrame("Right"),
      target: targetForTip("right", rightTip, rightClosed, rightRot),
      rotationHeld: false,
    },
  };
}

function stepBoth(
  sim: ToolSimulationController,
  exercise: ExerciseController,
  controls: ControlSnapshot,
  nowMs = controls.sourceTMs ?? 0,
) {
  const events = sim.update(controls, nowMs);
  return exercise.update(controls, sim.snapshot, events, nowMs);
}

function completePass(assisted = true, mode: "learn" | "practice" | "assessment" = "practice") {
  const sim = new ToolSimulationController({ assisted });
  const exercise = new ExerciseController({ mode });
  let t = 0;
  const tick = (tip: Vec3, closed: boolean, rotDeg = 0) => {
    t += 40;
    return stepBoth(sim, exercise, makeControls(t, tip, closed, zQuat(rotDeg)), t);
  };

  // Start calibrated at rest
  tick({ x: -0.5, y: 0.35, z: 0 }, false);
  if (mode === "learn") {
    expect(exercise.snapshot.phase).toBe("demonstration");
    exercise.startAttempt();
  }
  expect(exercise.snapshot.segmentId).toBe("approach");

  // 1. Approach -> Grip: move open tip to needle (0, 0.35, 0)
  tick({ x: 0, y: 0.35, z: 0 }, false);
  expect(exercise.snapshot.segmentId).toBe("grip");

  // 2. Grip: close jaws on needle, then move to Ring 1 alignment zone (-0.16, 0.24, 0)
  tick({ x: 0, y: 0.35, z: 0 }, true, 0);
  expect(sim.snapshot.object.heldBy).toBe("left-tool");
  tick({ x: -0.16, y: 0.24, z: 0 }, true, -8);
  expect(exercise.snapshot.segmentId).toBe("align");

  // 3. Align -> Entry: aligned within tolerance at Ring 1 gate
  tick({ x: -0.16, y: 0.24, z: 0 }, true, -10);
  expect(exercise.snapshot.segmentId).toBe("entry");
  expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1"]);

  // 4. Entry -> Rotation: advance along corridor to Ring 2 (0, 0.18, 0)
  tick({ x: -0.08, y: 0.2, z: 0 }, true, -10);
  tick({ x: 0, y: 0.18, z: 0 }, true, -10);
  expect(exercise.snapshot.segmentId).toBe("rotation");

  // 5. Rotation -> Exit: rotate wrist >= 12 deg through Ring 2 and reach Ring 3 (0.16, 0.24, 0)
  tick({ x: 0, y: 0.18, z: 0 }, true, 15);
  expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1", "ring-2"]);
  tick({ x: 0.16, y: 0.24, z: 0 }, true, 18);
  expect(exercise.snapshot.segmentId).toBe("exit");
  expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1", "ring-2", "ring-3"]);

  // 6. Exit -> Release: pull needle into release zone (0.2, 0.36, 0)
  tick({ x: 0.2, y: 0.36, z: 0 }, true, 18);
  expect(exercise.snapshot.segmentId).toBe("release");

  // 7. Release -> Complete: open jaws inside release zone
  tick({ x: 0.2, y: 0.36, z: 0 }, false, 18);
  expect(exercise.snapshot.phase).toBe("complete");
  expect(exercise.snapshot.segmentId).toBe("complete");
  expect(exercise.snapshot.overallProgress).toBe(1);
  expect(exercise.snapshot.readyForEvaluation).toBe(true);
  expect(exercise.snapshot.readyForReplay).toBe(true);

  return { sim, exercise };
}

describe("needle-passing configuration and corridor geometry", () => {
  it("validates skill contract targets, danger zones, and exact quadratic arc checkpoints", () => {
    expect(validateSkillSceneConfig(needlePassingSkill).id).toBe("needle-passing");
    expect(() => validateSkillSceneConfig({ ...needlePassingSkill, id: "invalid" })).toThrow();
    expect(corridorArcPoint(0)).toEqual(NEEDLE_PASSING_RINGS[0].position);
    expect(corridorArcPoint(0.5)).toEqual(NEEDLE_PASSING_RINGS[1].position);
    expect(corridorArcPoint(1)).toEqual(NEEDLE_PASSING_RINGS[2].position);
    for (const [u, ring] of [[0, NEEDLE_PASSING_RINGS[0]], [0.5, NEEDLE_PASSING_RINGS[1]], [1, NEEDLE_PASSING_RINGS[2]]] as const) {
      const m = corridorMetrics(ring.position);
      expect(m.u).toBeCloseTo(u, 2);
      expect(m.deviation).toBeCloseTo(0, 5);
    }
    expect(pointInBox(TISSUE_WALL_ZONE.center, TISSUE_WALL_ZONE)).toBe(true);
    expect(pointInBox(NEEDLE_PASSING_RINGS[1].position, TISSUE_WALL_ZONE)).toBe(false);
  });
});

describe("deterministic 8-segment progression and B3 evaluator compatibility", () => {
  it.each([true, false])("completes all 8 segments in order (assisted=%s) and scores cleanly in B3 evaluateAttempt", assisted => {
    const { exercise } = completePass(assisted, "practice");
    const recorded = exercise.getRecordedMotion();
    expect(recorded.skillId).toBe("needle-passing");
    expect(recorded.frames.length).toBeGreaterThanOrEqual(8);
    for (const frame of recorded.frames) {
      expect(motionFrameSchema.safeParse(frame).success).toBe(true);
    }
    const recordedSegments = [...new Set(recorded.frames.map(frame => frame.segmentId))];
    expect(recordedSegments).toEqual([
      "approach",
      "grip",
      "align",
      "entry",
      "rotation",
      "exit",
      "release",
      "complete",
    ]);

    const evaluation = evaluateAttempt(recorded, loadNeedleReference());
    const sequencing = evaluation.metrics.find(m => m.id === "proceduralSequencing");
    expect(sequencing?.score).toBe(100);
    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
  });
});

describe("invalid-action guardrails", () => {
  it("never advances past grip when moving un-held instruments through rings and release zone", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    const waypoints = [
      { x: 0, y: 0.35, z: 0 },
      NEEDLE_PASSING_RINGS[0].position,
      NEEDLE_PASSING_RINGS[1].position,
      NEEDLE_PASSING_RINGS[2].position,
      RELEASE_ZONE.position,
    ];
    let t = 0;
    for (const point of waypoints) {
      t += 40;
      stepBoth(sim, exercise, makeControls(t, point, false), t);
    }
    expect(exercise.snapshot.segmentId).toBe("grip");
    expect(exercise.snapshot.phase).toBe("active");
    expect(exercise.snapshot.completedTargetIds).toEqual([]);
  });

  it("blocks out-of-order ring skipping, unaligned entry, and unrotated apex pass", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    let t = 0;
    const tick = (tip: Vec3, closed: boolean, rotDeg = 0) => {
      t += 40;
      return stepBoth(sim, exercise, makeControls(t, tip, closed, zQuat(rotDeg)), t);
    };

    tick({ x: -0.5, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, true, 0);
    expect(exercise.snapshot.segmentId).toBe("grip");

    // Try skipping directly to Ring 3 and Release Zone while holding needle
    tick(NEEDLE_PASSING_RINGS[2].position, true, 0);
    tick(RELEASE_ZONE.position, true, 0);
    expect(exercise.snapshot.segmentId).toBe("grip");

    // Move to Ring 1 to reach align, but present 70 deg orientation error (> 45 deg tolerance)
    tick(NEEDLE_PASSING_RINGS[0].position, true, 70);
    expect(exercise.snapshot.segmentId).toBe("align");
    tick(NEEDLE_PASSING_RINGS[0].position, true, 70);
    expect(exercise.snapshot.segmentId).toBe("align");
    expect(exercise.snapshot.message).toContain("Level your wrist");

    // Bring orientation within tolerance to enter Ring 1
    tick(NEEDLE_PASSING_RINGS[0].position, true, 0);
    expect(exercise.snapshot.segmentId).toBe("entry");

    // Advance to Ring 2 without rotating wrist, then try jumping to Ring 3
    tick(NEEDLE_PASSING_RINGS[1].position, true, 0);
    expect(exercise.snapshot.segmentId).toBe("rotation");
    tick(NEEDLE_PASSING_RINGS[2].position, true, 2);
    expect(exercise.snapshot.segmentId).toBe("rotation");
    expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1"]);

    // Now return to Ring 2, rotate wrist >= 12 deg, then pass Ring 3
    tick(NEEDLE_PASSING_RINGS[1].position, true, 20);
    tick(NEEDLE_PASSING_RINGS[2].position, true, 20);
    expect(exercise.snapshot.segmentId).toBe("exit");
    expect(exercise.snapshot.completedTargetIds).toEqual(["ring-1", "ring-2", "ring-3"]);
  });

  it("does not complete on early needle release and recovers cleanly when re-acquired", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    let t = 0;
    const tick = (tip: Vec3, closed: boolean, rotDeg = 0) => {
      t += 40;
      return stepBoth(sim, exercise, makeControls(t, tip, closed, zQuat(rotDeg)), t);
    };

    tick({ x: -0.5, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, true, 0);
    tick(NEEDLE_PASSING_RINGS[0].position, true, 0);
    tick(NEEDLE_PASSING_RINGS[0].position, true, 0);
    expect(exercise.snapshot.segmentId).toBe("entry");

    // Accidental release during entry
    tick(NEEDLE_PASSING_RINGS[0].position, false, 0);
    expect(exercise.snapshot.segmentId).toBe("entry");
    expect(exercise.snapshot.phase).toBe("active");
    expect(exercise.snapshot.needleDropped).toBe(true);
    expect(exercise.snapshot.message).toContain("released early");

    // Re-grab needle and continue
    tick(NEEDLE_PASSING_RINGS[0].position, true, 0);
    expect(exercise.snapshot.needleDropped).toBe(false);
    tick(NEEDLE_PASSING_RINGS[1].position, true, 0);
    expect(exercise.snapshot.segmentId).toBe("rotation");
    tick(NEEDLE_PASSING_RINGS[1].position, true, 20);
    tick(NEEDLE_PASSING_RINGS[2].position, true, 20);
    expect(exercise.snapshot.segmentId).toBe("exit");
    tick(RELEASE_ZONE.position, true, 20);
    expect(exercise.snapshot.segmentId).toBe("release");

    // Move out of release zone and release early — must not complete!
    tick({ x: -0.2, y: 0.35, z: 0 }, true, 20);
    tick({ x: -0.2, y: 0.35, z: 0 }, false, 20);
    expect(exercise.snapshot.phase).toBe("active");
    expect(exercise.snapshot.segmentId).toBe("release");
    expect(exercise.snapshot.needleDropped).toBe(true);

    // Re-pick up, move back into release zone, and release cleanly
    tick({ x: -0.2, y: 0.35, z: 0 }, true, 20);
    tick(RELEASE_ZONE.position, true, 20);
    tick(RELEASE_ZONE.position, false, 20);
    expect(exercise.snapshot.phase).toBe("complete");
  });

  it("tracks danger-zone violations and blocks segment advancement while inside tissue-wall", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    let t = 0;
    const tick = (leftTip: Vec3, closed: boolean, rightTip: Vec3 = { x: 0.5, y: 0.35, z: 0 }) => {
      t += 40;
      return stepBoth(sim, exercise, makeControls(t, leftTip, closed, identityQuat, rightTip), t);
    };

    tick({ x: -0.5, y: 0.35, z: 0 }, false);
    // Right tool penetrates tissue-wall while left tool reaches needle
    tick({ x: 0, y: 0.35, z: 0 }, false, TISSUE_WALL_ZONE.center);
    expect(exercise.snapshot.inDangerZone).toBe(true);
    expect(exercise.snapshot.dangerZoneCount).toBe(1);
    expect(exercise.snapshot.segmentId).toBe("approach");

    // Clear danger zone -> advances to grip
    tick({ x: 0, y: 0.35, z: 0 }, false, { x: 0.5, y: 0.35, z: 0 });
    expect(exercise.snapshot.inDangerZone).toBe(false);
    expect(exercise.snapshot.segmentId).toBe("grip");
  });
});

describe("mode behavior hooks and freshness lifecycle", () => {
  it("runs Learn mode demonstration before active attempt and keeps ghost visible", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "learn" });
    stepBoth(sim, exercise, makeControls(0), 0);
    expect(exercise.snapshot.phase).toBe("demonstration");
    expect(exercise.snapshot.modeHooks.ghostVisible).toBe(true);
    expect(exercise.snapshot.modeHooks.canToggleGhost).toBe(false);

    for (let t = 40; t <= 3100; t += 40) {
      stepBoth(sim, exercise, makeControls(t), t);
    }
    expect(exercise.snapshot.phase).toBe("active");
    expect(exercise.snapshot.segmentId).toBe("approach");
  });

  it("supports Practice mode manual ghost toggle and auto-triggers ghost after sustained deviation", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    expect(exercise.snapshot.modeHooks.ghostVisible).toBe(false);
    expect(exercise.snapshot.modeHooks.canToggleGhost).toBe(true);
    expect(exercise.toggleGhost()).toBe(true);
    expect(exercise.toggleGhost()).toBe(false);

    // Reset manual override to null via setMode("practice") and trigger sustained corridor deviation in align
    exercise.setMode("practice");
    let t = 0;
    const tick = (tip: Vec3, closed: boolean) => {
      t += 50;
      return stepBoth(sim, exercise, makeControls(t, tip, closed), t);
    };
    tick({ x: -0.5, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, true);
    tick(NEEDLE_PASSING_RINGS[0].position, true);
    expect(exercise.snapshot.segmentId).toBe("align");

    // Deviate far above the corridor (y = 0.65) for > 1500 ms
    for (let step = 0; step < 35; step++) {
      tick({ x: -0.16, y: 0.65, z: 0 }, true);
    }
    expect(exercise.snapshot.modeHooks.ghostVisible).toBe(true);
    expect(exercise.snapshot.modeHooks.ghostAutoTriggered).toBe(true);
  });

  it("strictly hides ghost, path guide, target highlights, and live coaching in Assessment mode", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "assessment" });
    expect(exercise.snapshot.modeHooks).toEqual({
      mode: "assessment",
      ghostVisible: false,
      canToggleGhost: false,
      ghostAutoTriggered: false,
      showPathGuide: false,
      highlightCurrentTarget: false,
      voiceCoachingLevel: "none",
      showLiveCoaching: false,
    });
    expect(exercise.toggleGhost()).toBe(false);
    expect(exercise.setGhostVisible(true)).toBe(false);

    let t = 0;
    const tick = (tip: Vec3, closed: boolean) => {
      t += 50;
      return stepBoth(sim, exercise, makeControls(t, tip, closed), t);
    };
    tick({ x: -0.5, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, false);
    tick({ x: 0, y: 0.35, z: 0 }, true);
    tick(NEEDLE_PASSING_RINGS[0].position, true);
    for (let step = 0; step < 35; step++) {
      tick({ x: -0.16, y: 0.65, z: 0 }, true);
    }
    expect(exercise.snapshot.modeHooks.ghostVisible).toBe(false);
    expect(exercise.snapshot.modeHooks.ghostAutoTriggered).toBe(false);
    expect(exercise.snapshot.message).toBe("Segment: Align");
  });

  it("freezes on duplicate/stale/missing input and resets on calibration loss", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    const first = makeControls(40, { x: 0, y: 0.35, z: 0 }, false);
    stepBoth(sim, exercise, first, 40);
    const framesAfterFirst = exercise.snapshot.frameCount;

    // Duplicate source timestamp does not advance or record frames
    stepBoth(sim, exercise, first, 50);
    expect(exercise.snapshot.frameCount).toBe(framesAfterFirst);

    // Stale input pauses progression
    const stale = makeControls(80, { x: 0, y: 0.35, z: 0 }, false);
    stepBoth(sim, exercise, stale, 400);
    expect(exercise.snapshot.canProgress).toBe(false);
    expect(exercise.snapshot.frameCount).toBe(framesAfterFirst);

    // Uncalibrated input resets state
    stepBoth(sim, exercise, emptyControlSnapshot(), 440);
    expect(exercise.snapshot.phase).toBe("idle");
    expect(exercise.snapshot.frameCount).toBe(0);
  });
});
