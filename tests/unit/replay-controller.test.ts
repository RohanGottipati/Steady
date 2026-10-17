import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NEEDLE_PASSING_REFERENCE, normalizeToolWithGripOffset } from "@/lib/exercise/ghost-reference";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { adaptReferenceForAttempt } from "@/lib/exercise/attempt-evaluator";
import { EXERCISE_THRESHOLDS } from "@/lib/exercise/needle-passing-config";
import { emptyControlSnapshot } from "@/lib/vision/control-types";
import { ReplayController } from "@/lib/simulation/replay-controller";
import { composePose, relativePose, TIP_OFFSET } from "@/lib/simulation/tool-simulation";
import type { ReplayInput, ReplaySceneFrame } from "@/lib/simulation/replay-types";
import { evaluateAttempt } from "@/lib/evaluation/evaluate";
import type { MotionFrame, ReferenceMotion, ReplayMarker } from "@/types";

vi.mock("@/lib/storage/attempt-cache", () => ({ saveCompletedAttempt: vi.fn(async () => "memory") }));
const identity = { x: 0, y: 0, z: 0, w: 1 };
function frame(segmentId: string, tMs: number, x: number, closed = false): MotionFrame {
  const base = DEFAULT_NEEDLE_PASSING_REFERENCE.frames[0];
  return { tMs, segmentId, normalizedProgress: 0.9,
    leftTool: normalizeToolWithGripOffset({ ...base.leftTool, tipPosition: { x, y: 0.3, z: 0 }, rotation: identity,
      jawClosed: closed, ...(closed ? { heldObjectId: "practice-needle" } : {}) }),
    rightTool: structuredClone(base.rightTool) };
}
function input(): ReplayInput {
  const userFrames = [frame("approach", 0, 0), frame("approach", 100, 1), frame("approach", 300, 2),
    frame("grip", 400, 3, true), frame("grip", 900, 4, true), frame("complete", 1000, 5)];
  const reference: ReferenceMotion = { ...DEFAULT_NEEDLE_PASSING_REFERENCE,
    frames: [frame("approach", 0, 0), frame("approach", 10, 1), frame("approach", 20, 2), frame("approach", 30, 3),
      frame("grip", 50, 4, true), frame("grip", 70, 5, true), frame("grip", 90, 6, true), frame("grip", 110, 7, true), frame("complete", 120, 8)] };
  return { skillId: "needle-passing", userFrames, reference };
}
function marker(tMs = 15, segmentId = "approach"): ReplayMarker {
  return { tMs, segmentId, metricId: "pathSimilarity", severity: 1, explanationData: {} };
}
function sceneFrames(frames: readonly MotionFrame[]): ReplaySceneFrame[] {
  return frames.map(f => ({ visible: { left: true, right: true }, needle: { id: "practice-needle",
    position: { ...f.leftTool.tipPosition }, rotation: { ...identity }, heldBy: f.leftTool.heldObjectId ? "left-tool" : null } }));
}

describe("A6 replay clocks and alignment", () => {
  it("aligns by normalized frame position within each segment, not overall progress or duration ratio", () => {
    const replay = new ReplayController(input());
    replay.seekTime(100);
    expect(replay.snapshot.segmentProgress).toBe(0.5);
    expect(replay.snapshot.user?.leftTool.tipPosition.x).toBe(1);
    expect(replay.snapshot.reference?.tMs).toBe(15);
    expect(replay.snapshot.reference?.leftTool.tipPosition.x).toBe(1.5);
    replay.seekTime(650);
    expect(replay.snapshot.reference?.tMs).toBe(80);
    expect(replay.snapshot.segmentId).toBe("grip");
  });
  it("maps reference-time markers into user time, pauses, and switches from original timing", () => {
    const replay = new ReplayController(input()); replay.setMode("original"); replay.play();
    expect(replay.seekMarker(marker())).toBe(true);
    expect(replay.snapshot.timeMs).toBe(100);
    expect(replay.snapshot.mode).toBe("synchronized"); expect(replay.snapshot.playing).toBe(false);
    expect(replay.seekMarker(marker(80, "grip"))).toBe(true);
    expect(replay.snapshot.timeMs).toBe(650);
    const snapshot = replay.snapshot;
    expect(replay.seekMarker(marker(100, "missing"))).toBe(false); expect(replay.snapshot).toBe(snapshot);
  });
  it("seeks exact reference poses even when the matching user segment has only one frame", () => {
    const data = input();
    const frames = data.userFrames.filter((f, index) => f.segmentId !== "grip" || index === 3);
    const replay = new ReplayController({ ...data, userFrames: frames });
    expect(replay.seekMarker(marker(80, "grip"))).toBe(true);
    expect(replay.snapshot.reference!.tMs).toBeCloseTo(80, 6);
    expect(replay.snapshot.user!.tMs).toBe(400);
    replay.pause(); expect(replay.snapshot.reference!.tMs).toBeCloseTo(80, 6);
    replay.seekProgress(1);
    expect(replay.snapshot.segmentProgress).toBe(1);
    expect(replay.snapshot.reference!.tMs).toBe(120);
  });
  it("seeks evaluator markers to their exact aligned poses", () => {
    const data = input();
    const markers = evaluateAttempt({ skillId: data.skillId, frames: [...data.userFrames] }, data.reference).worstMoments;
    expect(markers.length).toBeGreaterThan(0);
    const replay = new ReplayController(data);
    for (const issue of markers) {
      expect(replay.seekMarker(issue)).toBe(true);
      expect(replay.snapshot.segmentId).toBe(issue.segmentId);
      expect(replay.snapshot.reference!.tMs).toBeCloseTo(issue.tMs, 6);
    }
  });
  it("preserves original timing and holds the shorter stream at its endpoint", () => {
    const replay = new ReplayController(input()); replay.setMode("original"); replay.seekTime(100);
    expect(replay.snapshot.reference?.tMs).toBe(100); expect(replay.snapshot.user?.tMs).toBe(100);
    replay.seekTime(800); expect(replay.snapshot.reference?.tMs).toBe(120);
    const data = input(); data.reference.frames.at(-1)!.tMs = 2000;
    const longer = new ReplayController(data); longer.setMode("original"); longer.seekTime(1700);
    expect(longer.snapshot.durationMs).toBe(2000); expect(longer.snapshot.user?.tMs).toBe(1000);
  });
  it.each([0.25, 0.5, 1] as const)("advances at %sx, clamps seeks, and stops at the end", speed => {
    const replay = new ReplayController(input()); replay.setSpeed(speed); replay.play(); replay.update(0.2);
    expect(replay.snapshot.timeMs).toBe(200 * speed);
    replay.update(-1); replay.update(NaN); expect(replay.snapshot.timeMs).toBe(200 * speed);
    replay.seekProgress(0.7); expect(replay.snapshot.timeMs).toBe(700); expect(replay.snapshot.playing).toBe(false);
    replay.play(); replay.update(100); expect(replay.snapshot.ended).toBe(true); expect(replay.snapshot.playing).toBe(false);
    replay.play(); expect(replay.snapshot.timeMs).toBe(0);
    replay.seekTime(-50); expect(replay.snapshot.timeMs).toBe(0);
    replay.seekTime(Infinity); expect(replay.snapshot.timeMs).toBe(0);
  });
  it("plays to the focused marker, pauses on that pose, and does not resume under later updates", () => {
    const replay = new ReplayController(input());
    expect(replay.armFocusPause(marker())).toBe(true);
    expect(replay.snapshot.playing).toBe(true);
    expect(replay.snapshot.divergenceEmphasis).toBe(false);
    replay.update(0.05);
    expect(replay.snapshot.timeMs).toBe(50);
    replay.update(0.05);
    expect(replay.snapshot.playing).toBe(false);
    expect(replay.snapshot.timeMs).toBe(100);
    expect(replay.snapshot.divergenceEmphasis).toBe(true);
    expect(replay.snapshot.focusPoint).not.toBeNull();
    expect(replay.snapshot.showExpert).toBe(true);
    expect(replay.snapshot.segmentId).toBe("approach");
    const paused = replay.snapshot.timeMs;
    replay.update(0.2);
    expect(replay.snapshot.timeMs).toBe(paused);
    expect(replay.snapshot.playing).toBe(false);
    replay.play();
    replay.update(0.05);
    expect(replay.snapshot.timeMs).toBe(150);
    expect(replay.snapshot.divergenceEmphasis).toBe(false);
  });
  it("lets manual playback clear a focus pause before the marker is reached", () => {
    const replay = new ReplayController(input());
    replay.armFocusPause(marker());
    replay.clearFocusPause();
    replay.play();
    replay.update(0.25);
    expect(replay.snapshot.timeMs).toBe(250);
    expect(replay.snapshot.playing).toBe(true);
    expect(replay.snapshot.divergenceEmphasis).toBe(false);
  });
  it("picks an already-passed marker immediately and drops the arm when the user seeks", () => {
    const replay = new ReplayController(input());
    replay.seekTime(400);
    expect(replay.armFocusPause(marker())).toBe(true);
    expect(replay.snapshot.playing).toBe(false);
    expect(replay.snapshot.timeMs).toBe(100);
    expect(replay.snapshot.divergenceEmphasis).toBe(true);
    const seeking = new ReplayController(input());
    expect(seeking.armFocusPause(marker())).toBe(true);
    seeking.update(0.02);
    seeking.seekTime(0);
    seeking.update(0.5);
    expect(seeking.snapshot.timeMs).toBe(0);
    expect(seeking.snapshot.playing).toBe(false);
    expect(seeking.snapshot.divergenceEmphasis).toBe(false);
  });
  it("leaves playback unchanged when the focused marker segment is missing", () => {
    const replay = new ReplayController(input());
    replay.play();
    expect(replay.armFocusPause(marker(100, "missing"))).toBe(false);
    expect(replay.snapshot.playing).toBe(true);
    expect(replay.snapshot.divergenceEmphasis).toBe(false);
    const empty = new ReplayController({ ...input(), userFrames: [] });
    expect(empty.armFocusPause(marker())).toBe(false);
    expect(empty.snapshot.divergenceEmphasis).toBe(false);
  });
  it("does not invent a comparison for missing or repeated user segments", () => {
    const data = input(); const frames = [...data.userFrames]; frames[1] = { ...frames[1], segmentId: "unavailable" };
    const replay = new ReplayController({ ...data, userFrames: frames }); replay.seekTime(100);
    expect(replay.snapshot.user).not.toBeNull(); expect(replay.snapshot.reference).toBeNull();
    replay.seekTime(0); expect(replay.snapshot.reference).toBeNull(); // repeated approach runs are ambiguous
    expect(replay.seekMarker(marker())).toBe(false);
  });
});

describe("A6 initial task review position", () => {
  function delayedInput(side: "left" | "right", withScene = true): ReplayInput {
    const data = input();
    const frames = [frame("approach", 1000, 0), frame("approach", 4000, 1), frame("grip", 7000, 2),
      frame("grip", 8000, 3), frame("complete", 10000, 4)];
    const scene = sceneFrames(frames);
    // The confirmed pickup is 6 seconds into this recording, on either side.
    frames[2][side === "left" ? "leftTool" : "rightTool"].heldObjectId = "practice-needle";
    frames[3][side === "left" ? "leftTool" : "rightTool"].heldObjectId = "practice-needle";
    scene[2].needle.heldBy = scene[3].needle.heldBy = side === "left" ? "left-tool" : "right-tool";
    return { ...data, userFrames: frames, ...(withScene ? { sceneFrames: scene } : {}) };
  }
  it.each(["left", "right"] as const)("opens paused three seconds before the first %s pickup, preserving the full recording", side => {
    const data = delayedInput(side); const before = structuredClone(data);
    const replay = new ReplayController(data); replay.seekToTaskStart();
    expect(replay.snapshot.timeMs).toBe(3000); expect(replay.snapshot.user!.tMs).toBe(4000);
    expect(replay.snapshot.playing).toBe(false); expect(replay.snapshot.needle?.heldBy).toBeNull();
    expect(replay.snapshot.durationMs).toBe(9000);
    replay.seekTime(0); expect(replay.snapshot.user!.tMs).toBe(1000);
    replay.seekProgress(1); expect(replay.snapshot.user!.tMs).toBe(10000);
    expect(data).toEqual(before);
  });
  it("uses confirmed ownership in tool-only recordings and ignores closed jaws and unrelated objects", () => {
    const data = delayedInput("right", false); data.userFrames[0].leftTool.jawClosed = true;
    data.userFrames[0].leftTool.heldObjectId = "other-object";
    const replay = new ReplayController(data); replay.seekToTaskStart(); expect(replay.snapshot.timeMs).toBe(3000);
  });
  it("prefers scene ownership and anchors the first pickup even after release and reacquisition", () => {
    const data = delayedInput("left"); data.userFrames[0].leftTool.heldObjectId = "practice-needle";
    const replay = new ReplayController(data); replay.seekToTaskStart(); expect(replay.snapshot.timeMs).toBe(3000);
    data.sceneFrames![3].needle.heldBy = null; data.sceneFrames![4].needle.heldBy = "right-tool";
    const reacquired = new ReplayController(data); reacquired.seekToTaskStart(); expect(reacquired.snapshot.timeMs).toBe(3000);
  });
  it("starts at zero for early or absent pickups, including empty and static recordings", () => {
    for (const time of [0, 1000, 3000]) {
      const data = input(); const frames = [frame("approach", 0, 0), frame("grip", time, 1, true), frame("complete", 5000, 2)];
      const replay = new ReplayController({ ...data, userFrames: frames }); replay.seekToTaskStart();
      expect(replay.snapshot.timeMs).toBe(0);
    }
    const data = input();
    for (const frames of [[], [frame("approach", 1000, 0)], [frame("approach", 1000, 0, true), frame("complete", 8000, 1, true)]]) {
      // An empty pinch (without heldObjectId) is not a successful pickup.
      const emptyGrip = frames.map(f => ({ ...f, leftTool: { ...f.leftTool, heldObjectId: undefined } }));
      const replay = new ReplayController({ ...data, userFrames: emptyGrip }); replay.seekToTaskStart();
      expect(replay.snapshot.timeMs).toBe(0);
    }
  });
});

describe("A6 geometry, events, and optional display smoothing", () => {
  it("never anticipates jaw/ownership events, and does not infer an object from closed jaws", () => {
    const data = input(); const scene = sceneFrames(data.userFrames);
    const replay = new ReplayController({ ...data, sceneFrames: scene });
    replay.seekTime(399); expect(replay.snapshot.user?.leftTool.jawClosed).toBe(false); expect(replay.snapshot.needle?.heldBy).toBeNull();
    replay.seekTime(400); expect(replay.snapshot.user?.leftTool.jawClosed).toBe(true); expect(replay.snapshot.needle?.heldBy).toBe("left-tool");
    replay.seekTime(999); expect(replay.snapshot.needle?.heldBy).toBe("left-tool");
    replay.seekTime(1000); expect(replay.snapshot.needle?.heldBy).toBeNull();
    const toolsOnly = new ReplayController(data); toolsOnly.seekTime(400); expect(toolsOnly.snapshot.needle).toBeNull();
  });
  it("preserves tool-tip geometry and grip-relative needle attachment through smoothing and quaternion sign flips", () => {
    const data = input();
    const frames = Array.from({ length: 15 }, (_, i) => {
      const f = frame("grip", i * 30, i * 0.02 + (i % 2 ? 0.01 : -0.01), true);
      f.leftTool.rotation = i % 2 ? { x: 0, y: 0, z: -0.1, w: -0.9949874371 } : { ...identity };
      f.leftTool = normalizeToolWithGripOffset(f.leftTool); return f;
    });
    const local = { position: { x: 0.04, y: 0.29, z: 0.01 }, rotation: identity };
    const scene = frames.map(f => ({ needle: { id: "practice-needle", ...composePose(f.leftTool, local), heldBy: "left-tool" as const }, visible: { left: true, right: false } }));
    const before = structuredClone({ frames, scene });
    const replay = new ReplayController({ ...data, userFrames: frames, sceneFrames: scene });
    replay.seekTime(210); const rawJitter = Math.abs(replay.snapshot.user!.leftTool.tipPosition.x - 0.14);
    replay.setSmoothing("centered-7");
    expect(Math.abs(replay.snapshot.user!.leftTool.tipPosition.x - 0.14)).toBeLessThan(rawJitter / 2);
    for (let t = 0; t <= 420; t += 1000 / 120) {
      replay.seekTime(t); const tool = replay.snapshot.user!.leftTool;
      expect(Math.hypot(tool.rotation.x, tool.rotation.y, tool.rotation.z, tool.rotation.w)).toBeCloseTo(1, 8);
      const tip = composePose(tool, { position: TIP_OFFSET, rotation: identity }).position;
      expect(tip.x).toBeCloseTo(tool.tipPosition.x, 8); expect(tip.y).toBeCloseTo(tool.tipPosition.y, 8);
      const attachment = relativePose(tool, replay.snapshot.needle!);
      expect(attachment.position.x).toBeCloseTo(local.position.x, 8);
      expect(attachment.position.y).toBeCloseTo(local.position.y, 8);
      expect(replay.snapshot.visible.right).toBe(false);
    }
    expect({ frames, scene }).toEqual(before);
    replay.seekTime(0); expect(replay.snapshot.user!.leftTool.tipPosition).toEqual(frames[0].leftTool.tipPosition);
    replay.seekTime(420); expect(replay.snapshot.user!.leftTool.tipPosition).toEqual(frames.at(-1)!.leftTool.tipPosition);
  });
  it("keeps event-adjacent samples unchanged and rebuilds paths only when display smoothing changes", () => {
    const data = input(); const replay = new ReplayController({ ...data, sceneFrames: sceneFrames(data.userFrames) });
    const trails = replay.getTrails(); replay.seekTime(100); expect(replay.getTrails()).toBe(trails);
    replay.setSmoothing("centered-7"); expect(replay.getTrails()).not.toBe(trails);
    for (const time of [0, 300, 400, 900, 1000]) {
      replay.seekTime(time); const index = data.userFrames.findIndex(f => f.tMs === time);
      expect(replay.snapshot.user!.leftTool.tipPosition).toEqual(data.userFrames[index].leftTool.tipPosition);
    }
    replay.setShowExpert(false); replay.setShowPaths(false);
    expect(replay.snapshot.showExpert).toBe(false); expect(replay.snapshot.showPaths).toBe(false);
  });
  it("does not smooth or draw path connectors across hidden tool intervals", () => {
    const data = input();
    const frames = Array.from({ length: 12 }, (_, i) => frame("approach", i * 10, i + (i % 2 ? 0.2 : 0)));
    const scene = sceneFrames(frames); for (let i = 6; i <= 8; i++) scene[i].visible.left = false;
    const replay = new ReplayController({ ...data, userFrames: frames, sceneFrames: scene }); replay.setSmoothing("centered-7");
    replay.seekTime(50); expect(replay.snapshot.user!.leftTool.tipPosition).toEqual(frames[5].leftTool.tipPosition);
    replay.seekTime(70); expect(replay.snapshot.visible.left).toBe(false);
    const path = replay.getTrails().user.left;
    for (let i = 0; i < path.length; i += 2) {
      expect((path[i].x < 6 && path[i + 1].x < 6) || (path[i].x >= 9 && path[i + 1].x >= 9)).toBe(true);
    }
  });
  it("renders empty, static, and duplicate-timestamp recordings deterministically", () => {
    const data = input(); const empty = new ReplayController({ ...data, userFrames: [] }); empty.play();
    expect(empty.snapshot.user).toBeNull(); expect(empty.snapshot.playing).toBe(false);
    const single = new ReplayController({ ...data, userFrames: [data.userFrames[0]] }); single.play();
    expect(single.snapshot.durationMs).toBe(0); expect(single.snapshot.playing).toBe(false);
    const duplicate = new ReplayController({ ...data, userFrames: [frame("approach", 0, 0), frame("approach", 0, 1), frame("complete", 10, 2)] });
    expect(duplicate.snapshot.user!.leftTool.tipPosition.x).toBe(1);
  });
  it("rejects invalid geometry, reversed time, mismatched sidecars, truncation, and noncanonical references", () => {
    const data = input(); const bad = structuredClone(data); bad.userFrames[1].leftTool.tipPosition.x = NaN;
    const rotation = structuredClone(data); rotation.userFrames[1].leftTool.rotation = { x: 0, y: 0, z: 0, w: 0 };
    const reversed = structuredClone(data); reversed.userFrames[2].tMs = 10;
    const repeated = structuredClone(data); repeated.reference.frames[5].segmentId = "approach";
    for (const candidate of [bad, rotation, reversed, repeated, { ...data, sceneFrames: [] }, { ...data, truncated: true }, { ...data, skillId: "other" }]) {
      expect(() => new ReplayController(candidate)).toThrow();
    }
  });
});

describe("A6 capture through S1", () => {
  it("retains a released needle's free pose when the tool moves away", () => {
    const runtime = new TrainingRuntime(undefined, "practice");
    let last = buildFixtureControlFrames("needle-pass-good", 1000)[0];
    for (const frame of buildFixtureControlFrames("needle-pass-good", 1000)) {
      last = frame; runtime.advance(frame, 1 / 30, frame.sourceTMs!);
      if (runtime.simulation.snapshot.object.heldBy) break;
    }
    expect(runtime.simulation.snapshot.object.heldBy).toBe("left-tool");
    const release = structuredClone(last); release.sourceTMs! += 33;
    release.left.lastSeenMs = release.right.lastSeenMs = release.sourceTMs!; release.left.target!.jawClosed = false;
    runtime.advance(release, 1 / 30, release.sourceTMs!);
    const released = structuredClone(runtime.simulation.snapshot.object);
    const moved = structuredClone(release); moved.sourceTMs! += 33;
    moved.left.lastSeenMs = moved.right.lastSeenMs = moved.sourceTMs!; moved.left.target!.position.x += 0.4;
    runtime.advance(moved, 1 / 30, moved.sourceTMs!);
    expect(runtime.simulation.snapshot.object).toEqual(released);
    const recording = runtime.exercise.getReplayRecording();
    const replay = new ReplayController({ skillId: recording.skillId, userFrames: recording.frames,
      sceneFrames: recording.sceneFrames, reference: DEFAULT_NEEDLE_PASSING_REFERENCE });
    replay.seekProgress(1); expect(replay.snapshot.needle?.position).toEqual(released.position);
    expect(replay.snapshot.needle?.heldBy).toBeNull();
  });
  it("marks a capped sidecar as truncated and refuses to present it as a complete replay", () => {
    const descriptor = Object.getOwnPropertyDescriptor(EXERCISE_THRESHOLDS, "maxRecordedFrames")!;
    Object.defineProperty(EXERCISE_THRESHOLDS, "maxRecordedFrames", { value: 4 });
    try {
      const runtime = new TrainingRuntime(undefined, "practice");
      for (const control of buildFixtureControlFrames("needle-pass-good", 1000).slice(0, 15)) {
        const time = control.sourceTMs!;
        const events = runtime.simulation.update(control, time);
        runtime.exercise.update(control, runtime.simulation.snapshot, events, time);
      }
      const recording = runtime.exercise.getReplayRecording();
      expect(recording.frames).toHaveLength(4); expect(recording.sceneFrames).toHaveLength(4);
      expect(recording.truncated).toBe(true);
      expect(() => new ReplayController({ skillId: recording.skillId, userFrames: recording.frames,
        truncated: recording.truncated, reference: DEFAULT_NEEDLE_PASSING_REFERENCE })).toThrow(/truncated/);
    } finally { Object.defineProperty(EXERCISE_THRESHOLDS, "maxRecordedFrames", descriptor); }
  });
  it.each([true, false])("captures exact sidecars and survives reset/camera invalidation (assisted=%s)", assisted => {
    const runtime = new TrainingRuntime(undefined, "practice"); runtime.configure("practice", null, false, assisted);
    for (const f of buildFixtureControlFrames("needle-pass-good", 1000)) runtime.advance(f, 1 / 30, f.sourceTMs!);
    expect(runtime.error).toBeNull(); const recording = runtime.exercise.getReplayRecording();
    expect(recording.frames.length).toBe(recording.sceneFrames.length);
    expect(recording.frames.at(-1)!.segmentId).toBe("complete");
    expect(recording.frames.every(f => !f.leftHand && !f.rightHand)).toBe(true);
    const completed = runtime.lastReplay!; expect(completed).toBeTruthy();
    expect(completed.mode).toBe("practice");
    expect(completed.review?.replayNarration).toBe(runtime.review?.review.replayNarration);
    const player = new ReplayController(completed.input);
    recording.frames.forEach((f, index) => {
      player.seekTime(f.tMs); expect(player.snapshot.needle?.heldBy).toBe(recording.sceneFrames[index].needle.heldBy);
      expect(player.snapshot.needle?.position.x).toBeCloseTo(recording.sceneFrames[index].needle.position.x, 6);
    });
    runtime.invalidateCalibration(); runtime.reset();
    expect(runtime.bundle).toBeNull(); expect(runtime.lastReplay).toBe(completed);
    expect(runtime.exercise.getReplayRecording().frames).toEqual([]);
    expect(player.snapshot.user).not.toBeNull();
  });
  it.each(["left", "right"] as const)("uses S1's exact %s one-hand scoring adaptation and hidden inactive tool", side => {
    const runtime = new TrainingRuntime(undefined, "practice"); runtime.configure("practice", null, true, true);
    for (const frame of buildFixtureControlFrames("needle-pass-good", 1000)) {
      const active = { ...frame.left, hand: { ...frame.left.hand!, handedness: side === "left" ? "Left" as const : "Right" as const },
        target: { ...frame.left.target!, id: side === "left" ? "left-tool" as const : "right-tool" as const } };
      const controls = { ...emptyControlSnapshot(), sourceTMs: frame.sourceTMs, calibrated: true, [side]: active };
      runtime.advance(controls, 1 / 30, frame.sourceTMs!);
    }
    const completed = runtime.lastReplay!; expect(completed).toBeTruthy();
    expect(completed.input.reference).toEqual(adaptReferenceForAttempt(DEFAULT_NEEDLE_PASSING_REFERENCE,
      { skillId: "needle-passing", frames: [...completed.input.userFrames] }, { singleHand: true }));
    expect(completed.input.sceneFrames!.every(f => f.visible[side] && !f.visible[side === "left" ? "right" : "left"])).toBe(true);
    const player = new ReplayController(completed.input);
    for (const marker of completed.markers) expect(player.seekMarker(marker)).toBe(true);
  });
});
