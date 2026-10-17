import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import {
  GhostPlaybackController,
  sampleReferenceAtProgress,
  sampleReferenceAtTime,
  sampleReferenceInSegment,
  slerpQuat,
} from "@/lib/exercise/ghost-playback";
import {
  DEFAULT_NEEDLE_PASSING_REFERENCE,
  DEFAULT_WORKSPACE_BOUNDS,
  extractGhostTrailPoints,
  mapJigsawsGesturesToSegments,
  NEEDLE_PASSING_SEGMENT_ORDER,
  RAW_DEFAULT_NEEDLE_PASSING_REFERENCE,
  SCENE_ALIGNED_NEEDLE_PASSING_REFERENCE,
  smoothReferenceForDisplay,
} from "@/lib/exercise/ghost-reference";
import { NEEDLE_PASSING_RINGS, pointDistance, quatAngleDegrees, RELEASE_ZONE, TISSUE_WALL_ZONE } from "@/lib/exercise/needle-passing-config";
import { composePose, TIP_OFFSET, ToolSimulationController } from "@/lib/simulation/tool-simulation";
import type { ControlSnapshot, ToolControlTarget } from "@/lib/vision/control-types";
import type { Quat, Vec3 } from "@/types";
import { identityQuat, makeHandFrame } from "../fixtures/contracts";
import { jitterAttempt, loadJigsawsExpertReference } from "../fixtures/evaluation";

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

describe("A5 reference frame interpolation and grip-to-tip invariant", () => {
  it("interpolates smoothly at 120 Hz between 30 Hz frames with no 30 Hz stepping and preserves unit quaternions", () => {
    const ref = DEFAULT_NEEDLE_PASSING_REFERENCE;
    const totalMs = ref.frames.at(-1)!.tMs;
    const dt120Hz = 1000 / 120; // 8.333 ms (4 samples per 30 Hz interval)

    let previousTip: Vec3 | null = null;
    let previousRot: Quat | null = null;
    let subFrameTransitions = 0;

    for (let t = 0; t <= totalMs; t += dt120Hz) {
      const sample = sampleReferenceAtTime(ref, t);
      const qL = sample.leftTool.rotation;
      const qR = sample.rightTool.rotation;
      expect(Math.hypot(qL.x, qL.y, qL.z, qL.w)).toBeCloseTo(1, 6);
      expect(Math.hypot(qR.x, qR.y, qR.z, qR.w)).toBeCloseTo(1, 6);

      // Verify grip-to-tip geometry invariant: gripPose + rotated(TIP_OFFSET) === tipPosition
      const composedLeftTip = composePose(sample.leftPose, {
        position: { ...TIP_OFFSET },
        rotation: identityQuat,
      }).position;
      const composedRightTip = composePose(sample.rightPose, {
        position: { ...TIP_OFFSET },
        rotation: identityQuat,
      }).position;
      expect(pointDistance(composedLeftTip, sample.leftTool.tipPosition)).toBeLessThan(1e-6);
      expect(pointDistance(composedRightTip, sample.rightTool.tipPosition)).toBeLessThan(1e-6);

      if (previousTip && previousRot) {
        const tipStep = pointDistance(previousTip, sample.leftTool.tipPosition);
        const rotStep = quatAngleDegrees(previousRot, sample.leftTool.rotation);
        if (sample.alpha > 0.05 && sample.alpha < 0.95) {
          // The canonical guide contains deliberate holds while closing jaws.
          // Interpolation must move only when the bracketing tip poses differ.
          const index = sample.bracketIndices[0];
          if (pointDistance(ref.frames[index].leftTool.tipPosition, ref.frames[index + 1].leftTool.tipPosition) > 1e-6) {
            expect(tipStep).toBeGreaterThan(1e-6);
            subFrameTransitions++;
          } else {
            expect(tipStep).toBeLessThan(1e-6);
          }
        }
        // No single 120 Hz step should jump more than 6 degrees
        expect(rotStep).toBeLessThan(6);
      }

      previousTip = sample.leftTool.tipPosition;
      previousRot = sample.leftTool.rotation;
    }

    expect(subFrameTransitions).toBeGreaterThan(30);
  });

  it("handles opposite-hemisphere quaternions (dot < 0) via shortest-path slerp without 360-degree flips", () => {
    const qA: Quat = { x: 0, y: 0, z: 0, w: 1 };
    const qB: Quat = { x: 0, y: 0, z: -0.1, w: -0.99498743710662 };
    const mid = slerpQuat(qA, qB, 0.5);
    expect(Math.hypot(mid.x, mid.y, mid.z, mid.w)).toBeCloseTo(1, 6);
    expect(quatAngleDegrees(qA, mid)).toBeLessThan(7);
    expect(quatAngleDegrees(mid, qB)).toBeLessThan(7);
  });

  it("matches reference JSON tool-tip coordinates in extracted ghost path trail and visits all scene checkpoints", () => {
    const rawTrail = extractGhostTrailPoints(RAW_DEFAULT_NEEDLE_PASSING_REFERENCE);
    expect(rawTrail.leftTipPoints).toHaveLength(RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames.length);
    expect(rawTrail.rightTipPoints).toHaveLength(RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames.length);

    for (let i = 0; i < RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames.length; i++) {
      const expectedLeft = RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames[i].leftTool.tipPosition;
      const expectedRight = RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames[i].rightTool.tipPosition;
      expect(pointDistance(rawTrail.leftTipPoints[i], expectedLeft)).toBeLessThan(1e-9);
      expect(pointDistance(rawTrail.rightTipPoints[i], expectedRight)).toBeLessThan(1e-9);
    }

    // Scene-aligned guide visits Needle (0, 0.35, 0), Ring 1, Ring 2, Ring 3, and Release Zone
    const sceneTrail = extractGhostTrailPoints(SCENE_ALIGNED_NEEDLE_PASSING_REFERENCE);
    const minDistanceTo = (target: Vec3) =>
      Math.min(...sceneTrail.leftTipPoints.map(pt => pointDistance(pt, target)));
    expect(minDistanceTo({ x: 0, y: 0.35, z: 0 })).toBeLessThan(0.01);
    expect(minDistanceTo(NEEDLE_PASSING_RINGS[0].position)).toBeLessThan(0.01);
    expect(minDistanceTo(NEEDLE_PASSING_RINGS[1].position)).toBeLessThan(0.01);
    expect(minDistanceTo(NEEDLE_PASSING_RINGS[2].position)).toBeLessThan(0.01);
    expect(minDistanceTo(RELEASE_ZONE.position)).toBeLessThan(0.01);
  });
});

describe("A5 GhostPlaybackController speed (0.5x / 1x) and synchronization modes", () => {
  it("replays at 0.5x and 1x speeds in demonstration and continuous modes with exact 1:2 rate scaling", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise1x = new ExerciseController({ mode: "learn" });
    const exerciseHalf = new ExerciseController({ mode: "learn" });

    // Enter Learn demonstration phase
    const c0 = makeControls(0);
    sim.update(c0, 0);
    exercise1x.update(c0, sim.snapshot, [], 0);
    exerciseHalf.update(c0, sim.snapshot, [], 0);

    const ghost1x = new GhostPlaybackController({ speed: 1, cycleDurationMs: 3000 });
    const ghostHalf = new GhostPlaybackController({ speed: 0.5, cycleDurationMs: 3000 });

    for (let step = 0; step < 30; step++) {
      ghost1x.update(exercise1x.snapshot, 1 / 60);
      ghostHalf.update(exerciseHalf.snapshot, 1 / 60);
    }

    expect(ghost1x.snapshot.visible).toBe(true);
    expect(ghostHalf.snapshot.visible).toBe(true);
    expect(ghost1x.snapshot.activeBehavior).toBe("demonstration");
    expect(ghostHalf.snapshot.activeBehavior).toBe("demonstration");
    expect(ghost1x.snapshot.segmentProgress).toBeCloseTo(0.5 / 3, 3);
    expect(ghostHalf.snapshot.segmentProgress).toBeCloseTo(0.25 / 3, 3);
    expect(ghostHalf.snapshot.segmentProgress).toBeCloseTo(ghost1x.snapshot.segmentProgress * 0.5, 4);
  });

  it("couples ghost progress to user segment with a 12% lead and micro-loops locally when user stalls", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const exercise = new ExerciseController({ mode: "practice" });
    exercise.toggleGhost(); // Enable ghost in Practice mode
    const ghost = new GhostPlaybackController({ speed: 1, syncMode: "progress-coupled", leadOffset: 0.12 });

    let t = 0;
    const stepSim = (tip: Vec3, closed: boolean) => {
      t += 40;
      const controls = makeControls(t, tip, closed);
      const events = sim.update(controls, t);
      return exercise.update(controls, sim.snapshot, events, t);
    };

    // Move to needle, grab, and enter Align segment at Ring 1
    stepSim({ x: -0.5, y: 0.35, z: 0 }, false);
    stepSim({ x: 0, y: 0.35, z: 0 }, false);
    stepSim({ x: 0, y: 0.35, z: 0 }, true);
    const alignSnap = stepSim(NEEDLE_PASSING_RINGS[0].position, true);
    expect(alignSnap.segmentId).toBe("align");

    // Step ghost for 15 frames (250 ms) while user is in align
    for (let i = 0; i < 15; i++) {
      ghost.update(exercise.snapshot, 1 / 60);
    }

    expect(ghost.snapshot.visible).toBe(true);
    expect(ghost.snapshot.segmentId).toBe("align");
    expect(ghost.snapshot.activeBehavior).toBe("progress-coupled");
    expect(ghost.snapshot.segmentProgress).toBeGreaterThan(exercise.snapshot.segmentProgress);
    expect(ghost.snapshot.segmentProgress).toBeCloseTo(
      Math.min(1, exercise.snapshot.segmentProgress + 0.12),
      2,
    );

    // Hold user stationary for > 600 ms -> ghost enters stall-loop within align without skipping to entry/rotation
    const stallSamples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const snap = ghost.update(exercise.snapshot, 1 / 60);
      if (snap.stalled) {
        stallSamples.push(snap.segmentProgress);
      }
    }

    expect(ghost.snapshot.stalled).toBe(true);
    expect(ghost.snapshot.activeBehavior).toBe("stall-loop");
    expect(ghost.snapshot.segmentId).toBe("align");
    expect(Math.max(...stallSamples) - Math.min(...stallSamples)).toBeGreaterThan(0.02);
  });

  it("strictly hides ghost tools and trail in Assessment mode and when Practice ghost is hidden", () => {
    const sim = new ToolSimulationController({ assisted: true });
    const assessmentExercise = new ExerciseController({ mode: "assessment" });
    const practiceExercise = new ExerciseController({ mode: "practice" });
    const ghost = new GhostPlaybackController({ speed: 1, syncMode: "continuous" });

    const c0 = makeControls(40);
    sim.update(c0, 40);
    assessmentExercise.update(c0, sim.snapshot, [], 40);
    practiceExercise.update(c0, sim.snapshot, [], 40);

    const assessSnap = ghost.update(assessmentExercise.snapshot, 1 / 60);
    expect(assessSnap.visible).toBe(false);
    expect(assessSnap.showTrail).toBe(false);
    expect(assessSnap.activeBehavior).toBe("hidden");

    const hiddenPracticeSnap = ghost.update(practiceExercise.snapshot, 1 / 60);
    expect(hiddenPracticeSnap.visible).toBe(false);
    expect(hiddenPracticeSnap.showTrail).toBe(false);

    practiceExercise.toggleGhost();
    const visiblePracticeSnap = ghost.update(practiceExercise.snapshot, 1 / 60);
    expect(visiblePracticeSnap.visible).toBe(true);
    expect(visiblePracticeSnap.showTrail).toBe(true);
  });
});

describe("A5 JIGSAWS expert workspace fitting and 7-frame display smoothing", () => {
  it("fits real JIGSAWS Needle_Passing_E005 into canonical workspace bounds and maps gestures to all 8 segments", () => {
    const rawJigsaws = loadJigsawsExpertReference("needle-passing");
    const ghost = new GhostPlaybackController();
    ghost.setReference(rawJigsaws, "jigsaws-expert-v1");

    const prepared = ghost.getReference();
    expect(prepared.frames.length).toBe(rawJigsaws.frames.length);
    expect(ghost.snapshot.attribution).toContain("Gao et al.");

    const presentSegments = new Set(prepared.frames.map(f => f.segmentId));
    for (const seg of NEEDLE_PASSING_SEGMENT_ORDER) {
      expect(presentSegments.has(seg)).toBe(true);
    }

    for (const frame of prepared.frames) {
      for (const tool of [frame.leftTool, frame.rightTool]) {
        expect(tool.tipPosition.x).toBeGreaterThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.xMin - 1e-6);
        expect(tool.tipPosition.x).toBeLessThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.xMax + 1e-6);
        expect(tool.tipPosition.y).toBeGreaterThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.yMin - 1e-6);
        expect(tool.tipPosition.y).toBeLessThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.yMax + 1e-6);
        expect(tool.tipPosition.z).toBeGreaterThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.zMin - 1e-6);
        expect(tool.tipPosition.z).toBeLessThanOrEqual(DEFAULT_WORKSPACE_BOUNDS.zMax + 1e-6);
        // Never dips into the tissue-wall danger box
        expect(tool.tipPosition.y).toBeGreaterThan(
          TISSUE_WALL_ZONE.center.y + TISSUE_WALL_ZONE.halfExtents.y,
        );
      }
    }

    // Sampling across segments and progress works cleanly on fitted JIGSAWS reference
    const midRot = sampleReferenceInSegment(prepared, "rotation", 0.5);
    expect(midRot.segmentId).toBe("rotation");
    const atEnd = sampleReferenceAtProgress(prepared, 1);
    expect(atEnd.normalizedProgress).toBeCloseTo(1, 5);

    // G2 preceded by G8 maps directly to "entry" (since G8 already covers "align"),
    // whereas G2 after G4 (on subsequent passes without G8) splits into "align" then "entry".
    const syntheticGestures = ["G8", "G8", "G2", "G2", "G4", "G4", "G2", "G2", "G2", "G2", "G11"];
    const baseFrame = RAW_DEFAULT_NEEDLE_PASSING_REFERENCE.frames[0];
    const mapped = mapJigsawsGesturesToSegments({
      ...RAW_DEFAULT_NEEDLE_PASSING_REFERENCE,
      frames: syntheticGestures.map((segmentId, idx) => ({
        ...baseFrame,
        tMs: idx * 33.333,
        normalizedProgress: idx / (syntheticGestures.length - 1),
        segmentId,
      })),
    });
    expect(mapped.frames.slice(0, 2).map(f => f.segmentId)).toEqual(["align", "align"]);
    expect(mapped.frames.slice(2, 4).map(f => f.segmentId)).toEqual(["entry", "entry"]);
    expect(mapped.frames.slice(6, 10).map(f => f.segmentId)).toEqual(["align", "align", "entry", "entry"]);
  });

  it("reduces high-frequency trajectory jitter via 7-frame centered display smoothing while preserving endpoints", () => {
    const jitteredRecorded = jitterAttempt(RAW_DEFAULT_NEEDLE_PASSING_REFERENCE, 42, 0.04);
    const noisyRef = {
      ...RAW_DEFAULT_NEEDLE_PASSING_REFERENCE,
      frames: jitteredRecorded.frames,
    };
    const smoothed = smoothReferenceForDisplay(noisyRef, 7);

    // Endpoints are preserved
    expect(pointDistance(smoothed.frames[0].leftTool.tipPosition, noisyRef.frames[0].leftTool.tipPosition)).toBeLessThan(1e-9);
    expect(
      pointDistance(
        smoothed.frames.at(-1)!.leftTool.tipPosition,
        noisyRef.frames.at(-1)!.leftTool.tipPosition,
      ),
    ).toBeLessThan(1e-9);

    const roughness = (frames: typeof noisyRef.frames) => {
      let sum = 0;
      for (let i = 1; i < frames.length - 1; i++) {
        const prev = frames[i - 1].leftTool.tipPosition;
        const curr = frames[i].leftTool.tipPosition;
        const next = frames[i + 1].leftTool.tipPosition;
        const accel = Math.hypot(
          next.x - 2 * curr.x + prev.x,
          next.y - 2 * curr.y + prev.y,
          next.z - 2 * curr.z + prev.z,
        );
        sum += accel;
      }
      return sum;
    };

    expect(roughness(smoothed.frames)).toBeLessThan(roughness(noisyRef.frames));
  });

  it("allows completing Needle Passing with only ONE hand in view when 1-Hand Mode is enabled", () => {
    const sim = new ToolSimulationController({ assisted: true, singleHand: true });
    const exercise = new ExerciseController({ mode: "practice" });
    let t = 0;

    const tickOneHand = (leftTip: Vec3, closed: boolean, rotDeg = 0) => {
      t += 40;
      const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (rotDeg * Math.PI) / 180);
      const controls: ControlSnapshot = {
        sourceTMs: t,
        calibrated: true,
        canProgress: true,
        left: {
          status: "tracking",
          lastSeenMs: t,
          hand: makeHandFrame("Left"),
          target: targetForTip("left", leftTip, closed, { x: q.x, y: q.y, z: q.z, w: q.w }),
          rotationHeld: false,
        },
        right: {
          status: "unavailable",
          lastSeenMs: null,
          hand: null,
          target: null,
          rotationHeld: false,
        },
      };
      const events = sim.update(controls, t);
      return exercise.update(controls, sim.snapshot, events, t);
    };

    tickOneHand({ x: -0.4, y: 0.35, z: 0 }, false);
    tickOneHand({ x: 0, y: 0.35, z: 0 }, false);
    expect(exercise.snapshot.segmentId).toBe("grip");

    tickOneHand({ x: 0, y: 0.35, z: 0 }, true, 0);
    expect(sim.snapshot.object.heldBy).toBe("left-tool");
    tickOneHand(NEEDLE_PASSING_RINGS[0].position, true, -8);
    expect(exercise.snapshot.segmentId).toBe("align");

    tickOneHand(NEEDLE_PASSING_RINGS[0].position, true, -10);
    expect(exercise.snapshot.segmentId).toBe("entry");

    tickOneHand({ x: -0.08, y: 0.2, z: 0 }, true, -10);
    tickOneHand(NEEDLE_PASSING_RINGS[1].position, true, -10);
    expect(exercise.snapshot.segmentId).toBe("rotation");

    tickOneHand(NEEDLE_PASSING_RINGS[1].position, true, 16);
    tickOneHand(NEEDLE_PASSING_RINGS[2].position, true, 18);
    expect(exercise.snapshot.segmentId).toBe("exit");

    tickOneHand(RELEASE_ZONE.position, true, 18);
    expect(exercise.snapshot.segmentId).toBe("release");

    tickOneHand(RELEASE_ZONE.position, false, 18);
    expect(exercise.snapshot.phase).toBe("complete");
    expect(exercise.snapshot.overallProgress).toBe(1);
  });
});
