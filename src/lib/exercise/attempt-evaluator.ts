import { needlePassingSkill } from "@/data/skills/needle-passing";
import { evaluateAttempt, toAttemptResult } from "@/lib/evaluation/evaluate";
import type { EvaluationResult, MetricExplanation, RecordedMotion } from "@/lib/evaluation/types";
import {
  attemptResultSchema,
  motionFrameSchema,
  savedAttemptSchema,
  type AttemptResult,
  type CoachingEvent,
  type MetricResult,
  type ReferenceMotion,
  type SavedAttempt,
  type SkillDefinition,
  type ToolState,
  type TrainingMode,
} from "@/types";
import { DEFAULT_NEEDLE_PASSING_REFERENCE, normalizeToolWithGripOffset } from "./ghost-reference";
import { TISSUE_WALL_ZONE } from "./needle-passing-config";
import { BOARD_EDGE_ZONE } from "./peg-transfer-config";
import { getRouteTask } from "./route-tasks";

export interface CompletedAttemptEvaluationInput {
  recorded: RecordedMotion;
  reference?: ReferenceMotion;
  skill?: SkillDefinition;
  mode?: TrainingMode;
  singleHand?: boolean;
  attemptId?: string;
  createdAt?: string;
  importantEvents?: CoachingEvent[];
}

export interface CompletedAttemptBundle {
  evaluation: EvaluationResult;
  attemptResult: AttemptResult;
  savedAttempt: SavedAttempt;
  activeSide: "left" | "right";
  strongestMetric: MetricResult & { explanation: string };
  weakestMetric: MetricResult & { explanation: string };
}

function makeAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function detectActiveSide(recorded: RecordedMotion): "left" | "right" {
  let leftHeld = 0;
  let rightHeld = 0;
  let leftClosed = 0;
  let rightClosed = 0;
  for (const frame of recorded.frames) {
    if (frame.leftTool.heldObjectId) leftHeld++;
    if (frame.rightTool.heldObjectId) rightHeld++;
    if (frame.leftTool.jawClosed) leftClosed++;
    if (frame.rightTool.jawClosed) rightClosed++;
  }
  if (rightHeld !== leftHeld) {
    return rightHeld > leftHeld ? "right" : "left";
  }
  return rightClosed > leftClosed ? "right" : "left";
}

function swapToolId(tool: ToolState, id: "left-tool" | "right-tool"): ToolState {
  return normalizeToolWithGripOffset({
    ...tool,
    id,
    position: { ...tool.position },
    rotation: { ...tool.rotation },
    tipPosition: { ...tool.tipPosition },
  });
}

/**
 * Adapt the canonical reference when the user passed the needle with `right-tool`
 * or used `1-Hand Mode` (`singleHand`), so evaluation compares the active hand
 * against the active reference trajectory and does not penalize the parked slot.
 */
export function adaptReferenceForAttempt(
  reference: ReferenceMotion,
  recorded: RecordedMotion,
  options: { singleHand?: boolean } = {},
): ReferenceMotion {
  if (reference.frames.length === 0 || recorded.frames.length === 0) {
    return reference;
  }

  const activeSide = detectActiveSide(recorded);
  const userSample = recorded.frames[0];
  const singleHand = Boolean(options.singleHand);

  const frames = reference.frames.map(frame => {
    let leftTool = frame.leftTool;
    let rightTool = frame.rightTool;

    if (activeSide === "right") {
      leftTool = swapToolId(frame.rightTool, "left-tool");
      rightTool = swapToolId(frame.leftTool, "right-tool");
    }

    if (singleHand) {
      if (activeSide === "left") {
        rightTool = swapToolId(userSample.rightTool, "right-tool");
      } else {
        leftTool = swapToolId(userSample.leftTool, "left-tool");
      }
    }

    return {
      ...frame,
      leftTool,
      rightTool,
    };
  });

  return {
    ...reference,
    frames,
  };
}

function attachExplanation(
  metric: MetricResult,
  explanations: readonly MetricExplanation[],
): MetricResult & { explanation: string } {
  const found = explanations.find(item => item.id === metric.id);
  return {
    ...metric,
    explanation: found?.text ?? `${metric.id}: ${metric.score}/100`,
  };
}

export function evaluateCompletedAttempt({
  recorded,
  reference = DEFAULT_NEEDLE_PASSING_REFERENCE,
  skill = needlePassingSkill,
  mode = "practice",
  singleHand = false,
  attemptId = makeAttemptId(),
  createdAt = new Date().toISOString(),
  importantEvents = [],
}: CompletedAttemptEvaluationInput): CompletedAttemptBundle {
  if (recorded.skillId !== skill.id || reference.skillId !== skill.id) {
    throw new Error("Attempt and reference must match the selected skill.");
  }
  if (recorded.frames.length < 2 || recorded.frames.at(-1)?.segmentId !== "complete") {
    throw new Error("The attempt recording is incomplete. Restart the attempt.");
  }
  let previousTime = -Infinity;
  for (const frame of recorded.frames) {
    motionFrameSchema.parse(frame);
    if (frame.tMs <= previousTime) throw new Error("Attempt timestamps must increase.");
    previousTime = frame.tMs;
  }
  if (!reference.frames.length) throw new Error("The evaluation reference is unavailable.");
  const activeSide = detectActiveSide(recorded);
  const adaptedReference = adaptReferenceForAttempt(reference, recorded, { singleHand });

  const evaluation = evaluateAttempt(recorded, adaptedReference, {
    metricWeights: skill.metricWeights,
    scene: {
      dangerBoxes: [skill.id === "peg-transfer" ? BOARD_EDGE_ZONE : getRouteTask(skill.id)?.danger ?? TISSUE_WALL_ZONE],
      collisionRadius: 0.05,
    },
  });

  const firstTMs = recorded.frames[0]?.tMs ?? 0;
  const lastTMs = recorded.frames.at(-1)?.tMs ?? firstTMs;
  const durationMs = Math.max(0, Math.round(lastTMs - firstTMs));

  const rawResult = toAttemptResult(evaluation, {
    id: attemptId,
    skillId: skill.id,
    mode,
    createdAt,
    durationMs,
    referenceMotionId: reference.id,
    importantEvents,
  });
  const attemptResult = attemptResultSchema.parse(rawResult);

  const savedAttempt = savedAttemptSchema.parse({
    result: attemptResult,
    // Product replay needs tool telemetry, not raw landmark/debug observations.
    userReplayFrames: recorded.frames.map(frame => ({
      tMs: frame.tMs, segmentId: frame.segmentId, normalizedProgress: frame.normalizedProgress,
      leftTool: frame.leftTool, rightTool: frame.rightTool,
    })),
    cloudSyncStatus: "pending",
  });

  const sortedMetrics = [...evaluation.metrics].sort((a, b) => b.score - a.score);
  const strongest = sortedMetrics[0] ?? evaluation.metrics[0];
  const weakest = sortedMetrics.at(-1) ?? evaluation.metrics[0];

  return {
    evaluation,
    attemptResult,
    savedAttempt,
    activeSide,
    strongestMetric: attachExplanation(strongest, evaluation.explanations),
    weakestMetric: attachExplanation(weakest, evaluation.explanations),
  };
}
