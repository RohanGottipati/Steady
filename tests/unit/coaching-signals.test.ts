import { describe, expect, it } from "vitest";
import { CoachingSignalsAdapter } from "@/lib/exercise/coaching-signals";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import type { TrainingMode } from "@/types";

it("derives speeds from accepted source timestamps and resets history on interruption", () => {
  const sim = new ToolSimulationController(); const exercise = new ExerciseController();
  const frame = buildFixtureControlFrames("needle-pass-good", 1000)[0];
  sim.update(frame, 1000); exercise.update(frame, sim.snapshot, [], 1000);
  const adapter = new CoachingSignalsAdapter();
  expect(adapter.sample(sim.snapshot, exercise.snapshot).toolSpeed).toBe(0);
  const moved = structuredClone(sim.snapshot);
  moved.sourceTMs = 1100; moved.left!.tipPosition.x += 0.1;
  expect(adapter.sample(moved, exercise.snapshot).toolSpeed).toBeCloseTo(1);
  adapter.reset(); expect(adapter.sample(moved, exercise.snapshot).toolSpeed).toBe(0);
  moved.singleHand = true; moved.sourceTMs = 1133; moved.right!.tipPosition.x += 1;
  expect(adapter.sample(moved, exercise.snapshot).assistingHandSpeed).toBe(0);
});

it("requires crossing the target plane and reversing before reporting overshoot", () => {
  const sim = new ToolSimulationController(), exercise = new ExerciseController();
  const frame = buildFixtureControlFrames("needle-pass-good", 1000)[0];
  sim.update(frame, 1000); exercise.update(frame, sim.snapshot, [], 1000);
  const adapter = new CoachingSignalsAdapter();
  const sample = (x: number, source: number) => {
    const snapshot = structuredClone(sim.snapshot);
    snapshot.sourceTMs = source;
    snapshot.left!.tipPosition = { x, y: 0.35, z: 0 };
    snapshot.right!.tipPosition = { x: 1, y: 1, z: 0 };
    snapshot.object.heldBy = "left-tool";
    return adapter.sample(snapshot, { ...exercise.snapshot, activeTargetId: "practice-needle" });
  };
  expect(sample(-0.2, 1000).overshoot).toBe(false);
  expect(sample(-0.1, 1033).overshoot).toBe(false);
  expect(sample(-0.16, 1066).overshoot).toBe(false);
  expect(sample(0.12, 1099).overshoot).toBe(false);
  expect(sample(0.09, 1132).overshoot).toBe(true);
  expect(sample(0.02, 1165).overshoot).toBe(false);
});

describe("S1 B6 runtime wiring", () => {
  it.each(["learn", "practice", "assessment"] as TrainingMode[])("records sustained deviations according to %s mode and retains events in the result", mode => {
    const runtime = new TrainingRuntime(needlePassingSkill, mode);
    let time = 1000;
    let injected = false;
    let sawMessage = false;
    for (const original of buildFixtureControlFrames("needle-pass-good")) {
      const feed = (offsetY = 0) => {
        time += 1000 / 30;
        const frame = structuredClone(original);
        frame.sourceTMs = frame.left.lastSeenMs = frame.right.lastSeenMs = time;
        frame.left.target!.position.y += offsetY;
        runtime.advance(frame, 1 / 30, time);
        sawMessage ||= runtime.message !== null;
        if (runtime.exercise.snapshot.phase === "demonstration") runtime.exercise.startAttempt();
      };
      if (!injected && runtime.exercise.snapshot.segmentId === "entry") {
        for (let i = 0; i < 40; i++) feed(0.5);
        injected = true;
      }
      feed();
    }
    expect(injected).toBe(true);
    expect(runtime.error).toBeNull(); expect(runtime.bundle).not.toBeNull();
    const events = runtime.bundle!.attemptResult.importantEvents;
    if (mode === "assessment") { expect(events).toEqual([]); expect(sawMessage).toBe(false); }
    else {
      expect(events.some(event => event.type === "path_deviation")).toBe(true);
      expect(events.filter(event => event.type === "path_deviation")).toHaveLength(1);
      expect(sawMessage).toBe(true);
    }
    runtime.reset(); expect(runtime.coaching.events).toEqual([]); expect(runtime.message).toBeNull();
  });
});
