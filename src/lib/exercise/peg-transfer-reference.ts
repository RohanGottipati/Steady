import pegTransferReferenceJson from "../../../public/references/peg-transfer/peg-transfer-reference-v1.json";
import { parseReference } from "@/lib/references/load-reference";
import type { ReferenceMotion, SkillDefinition } from "@/types";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "./ghost-reference";
import { PEG_HOME, PEG_ID, PEG_SEGMENT_IDS } from "./peg-transfer-config";
import { pegTransferSkill } from "@/data/skills/peg-transfer";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { ExerciseController } from "./exercise-controller";
import { buildFixtureControlFrames } from "./fixture-playback";
import { getRouteReference } from "./route-reference";
import { getRouteTask } from "./route-tasks";

export const RAW_PEG_TRANSFER_REFERENCE: ReferenceMotion = parseReference(pegTransferReferenceJson);

/**
 * Author the product guide through the same segment gates as a real attempt.
 * The adapter sample's segment labels end the transfer before the runtime does;
 * projecting that sparse file alone incorrectly penalizes a correct scene pass.
 * This fixed synthetic demonstration is never derived from a user's recording.
 */
export function buildSceneAlignedPegReference(): ReferenceMotion {
  const simulation = new ToolSimulationController({ taskObject: { id: PEG_ID, position: { ...PEG_HOME } } });
  const exercise = new ExerciseController({ skill: pegTransferSkill, mode: "practice" });
  for (const controls of buildFixtureControlFrames("peg-transfer-good")) {
    const now = controls.sourceTMs!;
    const events = simulation.update(controls, now);
    exercise.update(controls, simulation.snapshot, events, now);
    if (exercise.snapshot.phase === "complete") break;
  }
  if (!exercise.snapshot.readyForEvaluation) throw new Error("Canonical Peg Transfer demonstration did not finish.");
  const frames = exercise.getRecordedMotion().frames.map(frame => ({
    tMs: frame.tMs, segmentId: frame.segmentId, normalizedProgress: frame.normalizedProgress,
    leftTool: frame.leftTool, rightTool: frame.rightTool,
  }));
  const segments = PEG_SEGMENT_IDS.map(id => {
    const samples = frames.filter(frame => frame.segmentId === id);
    return { id, startMs: samples[0].tMs, endMs: samples.at(-1)!.tMs };
  });
  return parseReference({ ...RAW_PEG_TRANSFER_REFERENCE,
    sourceName: "Canonical Peg Transfer scene guide (synthetic, not expert data)",
    fps: 30, frames, segments, envelope: undefined,
  });
}

export const SCENE_ALIGNED_PEG_TRANSFER_REFERENCE: ReferenceMotion = buildSceneAlignedPegReference();

export function referenceForSkill(skill: SkillDefinition): ReferenceMotion {
  if (skill.id === "needle-passing") return DEFAULT_NEEDLE_PASSING_REFERENCE;
  if (skill.id === "peg-transfer") {
    const reference = SCENE_ALIGNED_PEG_TRANSFER_REFERENCE;
    if (reference.skillId !== skill.id || reference.id !== skill.referenceMotionId) {
      throw new Error("Peg Transfer reference does not match the skill definition.");
    }
    if (reference.segments.map(segment => segment.id).join(",") !== PEG_SEGMENT_IDS.join(",")) {
      throw new Error("Peg Transfer reference segments do not match the skill.");
    }
    return reference;
  }
  const task = getRouteTask(skill.id);
  if (task && skill.referenceMotionId === task.referenceMotionId) {
    const reference = getRouteReference(skill.id);
    if (!reference || reference.skillId !== skill.id || reference.id !== skill.referenceMotionId) {
      throw new Error(`Reference motion is unavailable for ${skill.id}.`);
    }
    if (reference.segments.map(segment => segment.id).join(",") !== skill.segments.map(segment => segment.id).join(",")) {
      throw new Error(`Reference motion is unavailable for ${skill.id}.`);
    }
    return reference;
  }
  throw new Error(`Reference motion is unavailable for ${skill.id}.`);
}
