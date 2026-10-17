import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { buildFixtureControlFrames, type FixtureId } from "@/lib/exercise/fixture-playback";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";
import { emptyControlSnapshot } from "@/lib/vision/control-types";
import { saveCompletedAttempt } from "@/lib/storage/attempt-cache";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import { TISSUE_WALL_ZONE } from "@/lib/exercise/needle-passing-config";
import { evaluateAttempt } from "@/lib/evaluation/evaluate";
import type { TrainingMode } from "@/types";

vi.mock("@/lib/storage/attempt-cache", () => ({ saveCompletedAttempt: vi.fn(async () => "indexeddb") }));
const empty = emptyControlSnapshot();
function finish(runtime: TrainingRuntime, hz = 60) {
  for (let i = 0; i < hz * 12 && !runtime.bundle && !runtime.error; i++) runtime.advance(empty, 1 / hz, i * 1000 / hz);
  expect(runtime.error).toBeNull();
  expect(runtime.exercise.snapshot.phase).toBe("complete");
  expect(runtime.bundle).not.toBeNull();
  return runtime.bundle!;
}
function cameraAttempt(runtime: TrainingRuntime, start = 1000) {
  for (const frame of buildFixtureControlFrames("needle-pass-good", start)) runtime.advance(frame, 1 / 30, frame.sourceTMs!);
  expect(runtime.error).toBeNull();
  return runtime.bundle!;
}

beforeEach(() => vi.mocked(saveCompletedAttempt).mockClear());
describe("S1 shared runtime", () => {
  it.each(["learn", "practice", "assessment"] as TrainingMode[])("animates both fixtures in %s without camera input", mode => {
    for (const fixture of ["needle-pass-good", "needle-pass-late-rotation"] as FixtureId[]) {
      const runtime = new TrainingRuntime(needlePassingSkill, mode);
      runtime.configure(mode, fixture, false, true);
      const bundle = finish(runtime);
      expect(bundle.attemptResult.performance.proceduralSequencing).toBe(100);
      expect(bundle.attemptResult.mode).toBe(mode);
      expect(runtime.saveStatus).toBe("demo");
      expect(empty.calibrated).toBe(false);
    }
    expect(saveCompletedAttempt).not.toHaveBeenCalled();
  });
  it("produces identical metric vectors at 10, 30, 60, and 120 display FPS", () => {
    const results = [10, 30, 60, 120].map(hz => {
      const runtime = new TrainingRuntime(); runtime.configure("learn", "needle-pass-good", false, true);
      return finish(runtime, hz).attemptResult;
    });
    for (const result of results) {
      expect(result.performance).toEqual(results[0].performance);
      expect(result.durationMs).toBe(results[0].durationMs);
    }
  });
  it("saves one webcam result, preserves it after stopping, and allocates a new ID on retry", async () => {
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    const bundle = cameraAttempt(runtime);
    expect(bundle).toBeTruthy();
    expect(bundle.savedAttempt.userReplayFrames.every(frame => !frame.leftHand && !frame.rightHand)).toBe(true);
    expect(runtime.exercise.getRecordedMotion().frames.some(frame => frame.leftHand)).toBe(true);
    for (const frame of buildFixtureControlFrames("needle-pass-good", 5000)) runtime.advance(frame, 1 / 30, frame.sourceTMs!);
    runtime.invalidateCalibration(); runtime.advance(empty, 1 / 60, 10000);
    expect(runtime.bundle).toBe(bundle);
    expect(saveCompletedAttempt).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(runtime.saveStatus).toBe("indexeddb");
    runtime.reset();
    const second = cameraAttempt(runtime, 12000);
    expect(second.attemptResult.id).not.toBe(bundle.attemptResult.id);
    expect(saveCompletedAttempt).toHaveBeenCalledTimes(2);
  });
  it("ignores completion of an old save after reset", async () => {
    let resolve!: (value: "indexeddb") => void;
    vi.mocked(saveCompletedAttempt).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const runtime = new TrainingRuntime(needlePassingSkill, "practice"); cameraAttempt(runtime);
    runtime.reset(); resolve("indexeddb"); await Promise.resolve();
    expect(runtime.bundle).toBeNull(); expect(runtime.saveStatus).toBe("idle");
  });
  it("restarts mode/source/assistance changes and replays fixtures repeatedly", () => {
    const runtime = new TrainingRuntime(); runtime.configure("learn", "needle-pass-good", false, true);
    for (let i = 0; i < 110; i++) runtime.advance(empty, 1 / 30, i * 1000 / 30);
    runtime.configure("assessment", "needle-pass-late-rotation", true, false);
    const late = finish(runtime);
    expect(runtime.simulation.snapshot.singleHand).toBe(true);
    runtime.configure("practice", "needle-pass-good", false, true);
    expect(finish(runtime).attemptResult.overallScore).toBeGreaterThan(late.attemptResult.overallScore);
    runtime.reset(); expect(finish(runtime).attemptResult.overallScore).toBeGreaterThan(80);
    runtime.configure("practice", null, false, true);
    expect(runtime.bundle).toBeNull(); expect(runtime.exercise.snapshot.phase).toBe("idle");
    expect(cameraAttempt(runtime, 50000)).toBeTruthy();
  });
  it("does not consume a fixture while suspended and clears coaching history on reset", () => {
    const runtime = new TrainingRuntime(); runtime.configure("learn", "needle-pass-good", false, true);
    runtime.advance(empty, 1 / 30, 100); const frames = runtime.exercise.snapshot.frameCount;
    runtime.suspend("Tab hidden");
    expect(runtime.exercise.snapshot.frameCount).toBe(frames);
    expect(runtime.simulation.snapshot.canProgress).toBe(false);
    expect(runtime.message).toBeNull();
    finish(runtime); runtime.reset(); expect(runtime.coaching.events).toEqual([]);
  });
  it("preserves the fixture's closing edge and held object across interruption", () => {
    const baseline = new TrainingRuntime(needlePassingSkill, "practice");
    baseline.configure("practice", "needle-pass-good", false, true);
    const expected = finish(baseline).attemptResult.performance;
    const closingIndex = buildFixtureControlFrames("needle-pass-good").findIndex(frame => frame.left.target!.jawClosed);
    for (const pauseAt of [closingIndex, closingIndex + 10]) {
      const runtime = new TrainingRuntime(needlePassingSkill, "practice");
      runtime.configure("practice", "needle-pass-good", false, true);
      for (let index = 0; index < pauseAt; index++) runtime.advance(empty, 1 / 30, index * 1000 / 30);
      const heldBy = runtime.simulation.snapshot.object.heldBy;
      runtime.suspend("Context lost");
      expect(runtime.simulation.snapshot.object.heldBy).toBe(heldBy);
      expect(finish(runtime).attemptResult.performance).toEqual(expected);
    }
  });
  it("scores independently of ghost source, smoothing, speed and visibility", () => {
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    const display = structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE);
    display.frames.forEach(frame => { frame.leftTool.tipPosition.y += 0.5; });
    runtime.ghost.setReference(display, "jigsaws-expert-v1"); runtime.ghost.setSpeed(0.5); runtime.exercise.toggleGhost();
    const altered = cameraAttempt(runtime);
    const baseline = cameraAttempt(new TrainingRuntime(needlePassingSkill, "practice"));
    expect(altered.attemptResult.performance).toEqual(baseline.attemptResult.performance);
  });
  it("stops at the recording limit instead of scoring a truncated attempt", () => {
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    const update = runtime.exercise.update.bind(runtime.exercise);
    vi.spyOn(runtime.exercise, "update").mockImplementation((...args) => {
      const snapshot = update(...args);
      runtime.exercise.snapshot = { ...snapshot, frameCount: 18000 };
      return runtime.exercise.snapshot;
    });
    const frame = buildFixtureControlFrames("needle-pass-good", 1000)[0];
    runtime.advance(frame, 1 / 30, 1000);
    expect(runtime.error).toContain("recording limit");
    expect(runtime.bundle).toBeNull(); expect(saveCompletedAttempt).not.toHaveBeenCalled();
  });
  it.each(["left", "right"] as const)("completes and evaluates the %s hand alone", side => {
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    runtime.configure("practice", null, true, true);
    for (const frame of buildFixtureControlFrames("needle-pass-good", 1000)) {
      const active = { ...frame.left, hand: { ...frame.left.hand!, handedness: side === "left" ? "Left" as const : "Right" as const },
        target: { ...frame.left.target!, id: side === "left" ? "left-tool" as const : "right-tool" as const } };
      const control = { ...emptyControlSnapshot(), sourceTMs: frame.sourceTMs, calibrated: true, [side]: active };
      runtime.advance(control, 1 / 30, frame.sourceTMs!);
    }
    expect(runtime.error).toBeNull(); expect(runtime.bundle?.activeSide).toBe(side);
    expect(runtime.bundle?.attemptResult.overallScore).toBeGreaterThan(80);
  });
  it("reports an evaluation failure without throwing or persisting a partial result", () => {
    const runtime = new TrainingRuntime(needlePassingSkill, "practice");
    vi.spyOn(runtime.exercise, "getRecordedMotion").mockReturnValue({ skillId: "needle-passing", frames: [] });
    for (const frame of buildFixtureControlFrames("needle-pass-good", 1000)) {
      expect(() => runtime.advance(frame, 1 / 30, frame.sourceTMs!)).not.toThrow();
    }
    expect(runtime.error).toContain("could not be evaluated");
    expect(runtime.bundle).toBeNull(); expect(saveCompletedAttempt).not.toHaveBeenCalled();
  });
});

describe("S1 evaluation input validation and exact safety geometry", () => {
  const recorded = () => ({ skillId: "needle-passing", frames: structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE.frames) });
  it("rejects empty, unfinished, mismatched, non-finite, or reordered recordings", () => {
    const invalid = [
      { skillId: "needle-passing", frames: [] },
      { ...recorded(), skillId: "other" },
      { ...recorded(), frames: recorded().frames.slice(0, -1) },
    ];
    const unordered = recorded(); unordered.frames[1].tMs = 0; invalid.push(unordered);
    const nonFinite = recorded(); nonFinite.frames[1].leftTool.tipPosition.x = NaN; invalid.push(nonFinite);
    for (const attempt of invalid) expect(() => evaluateCompletedAttempt({ recorded: attempt })).toThrow();
  });
  it("scores all tissue-wall faces/corners, both tools, and points just outside each axis", () => {
    const { center, halfExtents } = TISSUE_WALL_ZONE;
    for (const side of ["leftTool", "rightTool"] as const) {
      for (const axis of ["x", "y", "z"] as const) {
        for (const sign of [-1, 1]) {
          for (const outside of [false, true]) {
            const attempt = recorded();
            const point = { ...center, [axis]: center[axis] + sign * (halfExtents[axis] + (outside ? 0.00001 : 0)) };
            attempt.frames.forEach(frame => { frame[side].tipPosition = point; });
            const evaluation = evaluateAttempt(attempt, DEFAULT_NEEDLE_PASSING_REFERENCE, { scene: { dangerBoxes: [TISSUE_WALL_ZONE] } });
            expect(evaluation.performance.dangerZoneAvoidance).toBe(outside ? 100 : 0);
          }
        }
      }
      const attempt = recorded();
      attempt.frames.forEach(frame => { frame[side].tipPosition = { x: 0.35, y: 0.07, z: 0.12 }; });
      expect(evaluateCompletedAttempt({ recorded: attempt }).attemptResult.performance.dangerZoneAvoidance).toBe(0);
    }
  });
});
