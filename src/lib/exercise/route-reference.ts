import { parseReference } from "@/lib/references/load-reference";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import type { ReferenceMotion } from "@/types";
import { ExerciseController } from "./exercise-controller";
import { buildFixtureControlFrames } from "./fixture-playback";
import { listRouteTasks, routeFixtureId, type RouteTask } from "./route-tasks";

function buildSceneAlignedRouteReference(task: RouteTask): ReferenceMotion {
  const simulation = new ToolSimulationController({ taskObject: { id: task.objectId, position: { ...task.home } } });
  const exercise = new ExerciseController({ skill: task.skill, mode: "practice" });
  for (const controls of buildFixtureControlFrames(routeFixtureId(task.skillId))) {
    const now = controls.sourceTMs!;
    const events = simulation.update(controls, now);
    exercise.update(controls, simulation.snapshot, events, now);
    if (exercise.snapshot.phase === "complete") break;
  }
  if (!exercise.snapshot.readyForEvaluation) {
    throw new Error(`Canonical ${task.title} demonstration did not finish (stuck in ${exercise.snapshot.segmentId}).`);
  }
  const frames = exercise.getRecordedMotion().frames.map(frame => ({
    tMs: frame.tMs,
    segmentId: frame.segmentId,
    normalizedProgress: frame.normalizedProgress,
    leftTool: frame.leftTool,
    rightTool: frame.rightTool,
  }));
  const segments = task.segmentIds.map(id => {
    const samples = frames.filter(frame => frame.segmentId === id);
    if (!samples.length) throw new Error(`Canonical ${task.title} guide is missing segment ${id}.`);
    return { id, startMs: samples[0].tMs, endMs: samples.at(-1)!.tMs };
  });
  return parseReference({
    schemaVersion: 1,
    id: task.referenceMotionId,
    skillId: task.skillId,
    sourceType: "internal-recording",
    sourceName: `Canonical ${task.title} scene guide (synthetic, not expert data)`,
    coordinateSystem: "scene-canonical-v1",
    fps: 30,
    frames,
    segments,
  });
}

const ROUTE_REFERENCES: ReadonlyMap<string, ReferenceMotion> = new Map(
  listRouteTasks().map(task => [task.skillId, buildSceneAlignedRouteReference(task)]),
);

export function getRouteReference(skillId: string): ReferenceMotion | undefined {
  return ROUTE_REFERENCES.get(skillId);
}
