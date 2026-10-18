import { describe, expect, it } from "vitest";
import { evaluateCompletedAttempt } from "@/lib/exercise/attempt-evaluator";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import { buildFixtureControlFrames } from "@/lib/exercise/fixture-playback";
import { referenceForSkill } from "@/lib/exercise/peg-transfer-reference";
import { listRouteTasks, routeFixtureId, validateRouteSkill } from "@/lib/exercise/route-tasks";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { ReplayController } from "@/lib/simulation/replay-controller";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";

describe("route skills", () => {
  it("trains suturing, knot tying, and six additional drills on the shared runtime", () => {
    expect(listRouteTasks().map(task => task.skillId)).toEqual([
      "suturing",
      "knot-tying",
      "pattern-cutting",
      "ligating-loop",
      "clip-applying",
      "needle-loading",
      "tissue-retraction",
      "camera-navigation",
    ]);

    for (const task of listRouteTasks()) {
      expect(validateRouteSkill(task.skill).id).toBe(task.skillId);
      const reference = referenceForSkill(task.skill);
      expect(reference.id).toBe(task.referenceMotionId);
      expect(reference.segments.map(segment => segment.id)).toEqual([...task.segmentIds]);
      expect(reference.frames.at(-1)?.segmentId).toBe("complete");

      const simulation = new ToolSimulationController({
        assisted: true,
        taskObject: { id: task.objectId, position: { ...task.home } },
      });
      const exercise = new ExerciseController({ skill: task.skill, mode: "practice" });
      for (const controls of buildFixtureControlFrames(routeFixtureId(task.skillId))) {
        const now = controls.sourceTMs!;
        const events = simulation.update(controls, now);
        exercise.update(controls, simulation.snapshot, events, now);
        if (exercise.snapshot.phase === "complete") break;
      }
      expect(exercise.snapshot.phase, task.skillId).toBe("complete");
      expect(exercise.snapshot.readyForEvaluation, task.skillId).toBe(true);

      const bundle = evaluateCompletedAttempt({
        recorded: exercise.getRecordedMotion(),
        reference,
        skill: task.skill,
        mode: "practice",
      });
      expect(bundle.attemptResult.skillId).toBe(task.skillId);
      expect(bundle.attemptResult.overallScore).toBeGreaterThan(0);

      const replay = new ReplayController({
        skillId: task.skillId,
        reference,
        userFrames: bundle.savedAttempt.userReplayFrames,
        sceneFrames: exercise.getReplayRecording().sceneFrames,
      });
      expect(replay.snapshot.segmentId).toBeTruthy();

      const runtime = new TrainingRuntime(task.skill, "learn");
      expect(runtime.exercise.skill.id).toBe(task.skillId);
    }
  });
});
