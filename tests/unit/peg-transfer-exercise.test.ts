import { describe, expect, it } from "vitest";
import { pegTransferSkill } from "@/data/skills/peg-transfer";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { prepareGhostReference } from "@/lib/exercise/ghost-reference";
import { PEG_HOME, PEG_SEGMENT_IDS, TARGET_POST, TRANSFER_ZONE, validatePegTransferSceneConfig } from "@/lib/exercise/peg-transfer-config";
import { referenceForSkill, SCENE_ALIGNED_PEG_TRANSFER_REFERENCE } from "@/lib/exercise/peg-transfer-reference";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import { ReplayController } from "@/lib/simulation/replay-controller";
import { TIP_OFFSET, ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { emptyControlSnapshot, type ControlSnapshot, type ToolControlTarget } from "@/lib/vision/control-types";
import type { Quat, Vec3 } from "@/types";
import { identityQuat, makeHandFrame } from "../fixtures/contracts";
import { Quaternion, Vector3 } from "three";

function targetForTip(side: "left" | "right", tip: Vec3, closed = false, rotation: Quat = identityQuat): ToolControlTarget {
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  const offset = new Vector3(TIP_OFFSET.x, TIP_OFFSET.y, TIP_OFFSET.z).applyQuaternion(q);
  return {
    id: side === "left" ? "left-tool" : "right-tool",
    position: { x: tip.x - offset.x, y: tip.y - offset.y, z: tip.z - offset.z },
    rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    jawClosed: closed,
  };
}

function makeControls(tMs: number, leftTip: Vec3, leftClosed: boolean, rightTip: Vec3, rightClosed = false): ControlSnapshot {
  return {
    sourceTMs: tMs,
    calibrated: true,
    canProgress: true,
    left: {
      status: "tracking",
      lastSeenMs: tMs,
      hand: makeHandFrame("Left"),
      target: targetForTip("left", leftTip, leftClosed),
      rotationHeld: false,
    },
    right: {
      status: "tracking",
      lastSeenMs: tMs,
      hand: makeHandFrame("Right"),
      target: targetForTip("right", rightTip, rightClosed),
      rotationHeld: false,
    },
  };
}

function step(sim: ToolSimulationController, exercise: ExerciseController, controls: ControlSnapshot) {
  const events = sim.update(controls, controls.sourceTMs ?? 0);
  return exercise.update(controls, sim.snapshot, events, controls.sourceTMs ?? 0);
}

describe("peg transfer skill config", () => {
  it("uses its own segments, targets, and scene-aligned reference", () => {
    expect(validatePegTransferSceneConfig().sceneConfig.sceneId).toBe("peg-transfer-scene");
    expect(() => validatePegTransferSceneConfig({ ...pegTransferSkill, id: "needle-passing" })).toThrow(/Unsupported skill/);
    const reference = referenceForSkill(pegTransferSkill);
    expect(reference.id).toBe("peg-transfer-reference-v1");
    expect(reference.segments.map(segment => segment.id)).toEqual([...PEG_SEGMENT_IDS]);
    expect(reference.frames.every(frame => frame.leftTool.tipPosition.z === 0)).toBe(true);
    expect(reference.frames.some(frame => ["approach", "align", "entry", "rotation"].includes(frame.segmentId))).toBe(false);
    const prepared = prepareGhostReference(SCENE_ALIGNED_PEG_TRANSFER_REFERENCE);
    expect(prepared.frames.map(frame => frame.segmentId)).toEqual(reference.frames.map(frame => frame.segmentId));
    expect(() => referenceForSkill({ ...pegTransferSkill, id: "suturing" })).toThrow(/unavailable/);
    expect(() => new ExerciseController({ skill: { ...pegTransferSkill, id: "knot-tying" } })).toThrow(/Unsupported skill/);
  });
});

describe("peg transfer segment machine", () => {
  it("completes reach → grasp → lift → transfer → place → release without needle-passing ids", () => {
    const sim = new ToolSimulationController({ assisted: true, taskObject: { id: "practice-peg", position: { ...PEG_HOME } } });
    const exercise = new ExerciseController({ skill: pegTransferSkill, mode: "practice" });
    let t = 0;
    const parked = { x: 0.45, y: 0.32, z: 0 };
    const tick = (left: Vec3, leftClosed: boolean, right: Vec3 = parked, rightClosed = false) => {
      t += 40;
      return step(sim, exercise, makeControls(t, left, leftClosed, right, rightClosed));
    };

    tick({ x: -0.5, y: 0.28, z: 0 }, false);
    expect(exercise.snapshot.segmentId).toBe("reach");
    tick({ ...PEG_HOME }, false);
    expect(exercise.snapshot.segmentId).toBe("grasp");

    tick({ ...PEG_HOME }, false);
    tick({ ...PEG_HOME }, true);
    expect(sim.snapshot.object.heldBy).toBe("left-tool");
    expect(exercise.snapshot.segmentId).toBe("lift");
    expect(exercise.snapshot.completedTargetIds).toEqual(["source-post"]);

    tick({ x: -0.133, y: 0.32, z: 0 }, true);
    expect(exercise.snapshot.segmentId).toBe("transfer");

    tick({ ...TRANSFER_ZONE.position }, true, { x: 0.04, y: TRANSFER_ZONE.position.y, z: 0 });
    expect(exercise.snapshot.segmentId).toBe("place");
    expect(exercise.snapshot.completedTargetIds).toEqual(["source-post", "transfer-zone"]);

    tick({ ...TARGET_POST.position }, true, parked);
    expect(exercise.snapshot.segmentId).toBe("release");
    expect(exercise.snapshot.completedTargetIds).toEqual(["source-post", "transfer-zone", "target-post"]);

    tick({ ...TARGET_POST.position }, false, parked);
    expect(exercise.snapshot.phase).toBe("complete");
    expect(exercise.snapshot.segmentId).toBe("complete");
    expect(exercise.snapshot.readyForEvaluation).toBe(true);
    const segments = [...new Set(exercise.getRecordedMotion().frames.map(frame => frame.segmentId))];
    expect(segments).toEqual([...PEG_SEGMENT_IDS]);
  });

  it("does not let a visit to the right post, an early release, or a skipped midline finish the skill", () => {
    const sim = new ToolSimulationController({ assisted: true, taskObject: { id: "practice-peg", position: { ...PEG_HOME } } });
    const exercise = new ExerciseController({ skill: pegTransferSkill, mode: "assessment" });
    let t = 0;
    const tick = (left: Vec3, leftClosed: boolean, right: Vec3 = { x: 0.45, y: 0.32, z: 0 }) => {
      t += 40;
      return step(sim, exercise, makeControls(t, left, leftClosed, right));
    };

    expect(exercise.snapshot.modeHooks.ghostVisible).toBe(false);
    expect(exercise.snapshot.modeHooks.showPathGuide).toBe(false);
    expect(exercise.snapshot.modeHooks.voiceCoachingLevel).toBe("none");

    tick({ ...TARGET_POST.position }, false);
    tick({ ...TARGET_POST.position }, true);
    expect(exercise.snapshot.segmentId).toBe("reach");
    expect(sim.snapshot.object.heldBy).toBeNull();

    tick({ x: -0.5, y: 0.28, z: 0 }, false);
    tick({ ...PEG_HOME }, false);
    tick({ ...PEG_HOME }, false);
    tick({ ...PEG_HOME }, true);
    expect(exercise.snapshot.segmentId).toBe("lift");

    tick({ x: -0.133, y: 0.32, z: 0 }, false);
    expect(exercise.snapshot.segmentId).toBe("lift");
    expect(exercise.snapshot.needleDropped).toBe(true);

    tick({ x: -0.133, y: 0.32, z: 0 }, true);
    expect(exercise.snapshot.needleDropped).toBe(false);
    tick({ x: -0.133, y: 0.32, z: 0 }, true);
    expect(exercise.snapshot.segmentId).toBe("transfer");

    tick({ ...TARGET_POST.position }, true);
    expect(exercise.snapshot.segmentId).toBe("transfer");
    expect(exercise.snapshot.phase).toBe("active");
  });

  it("runs the peg-transfer fixture to a completed evaluation on the shared runtime", () => {
    const runtime = new TrainingRuntime(pegTransferSkill, "practice");
    runtime.configure("assessment", "peg-transfer-good", false, true);
    expect(runtime.exercise.snapshot.modeHooks.ghostVisible).toBe(false);
    let now = 1_000;
    for (let frame = 0; frame < 800 && !runtime.bundle && !runtime.error; frame++) {
      runtime.advance(emptyControlSnapshot(), 1 / 30, now);
      now += 34;
    }
    expect(runtime.error).toBeNull();
    expect(runtime.bundle?.attemptResult.skillId).toBe("peg-transfer");
    expect(runtime.bundle?.attemptResult.overallScore).toBeGreaterThan(95);
    expect(runtime.bundle?.attemptResult.performance.pathSimilarity).toBeGreaterThan(95);
    expect(runtime.bundle?.savedAttempt.result.referenceMotionId).toBe("peg-transfer-reference-v1");
    expect(runtime.exercise.snapshot.segmentId).toBe("complete");
    expect(buildFixtureControlFrames("peg-transfer-good").length).toBeGreaterThan(10);
    expect(runtime.lastReplay?.input.skillId).toBe("peg-transfer");
    expect(() => new ReplayController(runtime.lastReplay!.input)).not.toThrow();
    const perturbed = structuredClone(runtime.bundle!.savedAttempt.userReplayFrames);
    for (const frame of perturbed) {
      frame.leftTool.tipPosition.y += 0.15;
      frame.leftTool.position.y += 0.15;
    }
    const worse = evaluateCompletedAttempt({ recorded: { skillId: "peg-transfer", frames: perturbed },
      skill: pegTransferSkill, reference: referenceForSkill(pegTransferSkill), mode: "assessment" });
    expect(worse.attemptResult.performance.pathSimilarity).toBeLessThan(runtime.bundle!.attemptResult.performance.pathSimilarity);
    expect(worse.attemptResult.overallScore).toBeLessThan(runtime.bundle!.attemptResult.overallScore);
  });
});
