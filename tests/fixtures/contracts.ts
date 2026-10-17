import type {
  AttemptResult,
  HandFrame,
  MotionFrame,
  PerformanceVector,
  ReferenceMotion,
  SkillDefinition,
  ToolState,
  Vec3,
} from "@/types";
import { COORDINATE_SYSTEM, DATA_SCHEMA_VERSION } from "@/types";

export const identityQuat = { x: 0, y: 0, z: 0, w: 1 };

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function makeToolState(
  id: ToolState["id"],
  overrides: Partial<ToolState> = {},
): ToolState {
  return {
    id,
    position: vec3(),
    rotation: identityQuat,
    tipPosition: vec3(0, 0, 0.1),
    jawClosed: false,
    ...overrides,
  };
}

export function makeHandFrame(
  handedness: HandFrame["handedness"],
  overrides: Partial<HandFrame> = {},
): HandFrame {
  return {
    handedness,
    confidence: 0.95,
    landmarks: Array.from({ length: 21 }, () => vec3()),
    worldLandmarks: Array.from({ length: 21 }, () => vec3()),
    palmCenter: vec3(),
    palmRotation: identityQuat,
    pinchRatio: 0.2,
    isPinching: false,
    ...overrides,
  };
}

export function makeMotionFrame(
  overrides: Partial<MotionFrame> = {},
): MotionFrame {
  return {
    tMs: 0,
    segmentId: "approach",
    normalizedProgress: 0,
    leftTool: makeToolState("left-tool"),
    rightTool: makeToolState("right-tool"),
    ...overrides,
  };
}

export const perfectPerformance: PerformanceVector = {
  pathSimilarity: 100,
  targetAccuracy: 100,
  depthConsistency: 100,
  instrumentOrientationAccuracy: 100,
  movementSmoothness: 100,
  pathEfficiency: 100,
  motionStability: 100,
  overshootControl: 100,
  correctionEfficiency: 100,
  rotationControlAccuracy: 100,
  pinchStability: 100,
  gripTiming: 100,
  handWorkspaceControl: 100,
  bimanualCoordination: 100,
  segmentTiming: 100,
  speedProfileControl: 100,
  idleTimeControl: 100,
  toolCollisionAvoidance: 100,
  dangerZoneAvoidance: 100,
  proceduralSequencing: 100,
};

export const sampleSkillDefinition: SkillDefinition = {
  id: "needle-passing",
  title: "Needle Passing",
  description: "Pass a needle through a ring with two instruments.",
  category: "suturing",
  difficulty: "beginner",
  estimatedMinutes: 5,
  referenceMotionId: "needle-passing-ref-v1",
  sourceLabel: "internal fixture",
  availableModes: ["learn", "practice", "assessment"],
  segments: [
    {
      id: "approach",
      title: "Approach",
      instructions: "Move both tools toward the ring.",
    },
    {
      id: "complete",
      title: "Complete",
      instructions: "Hold still to finish.",
    },
  ],
  metricWeights: { pathSimilarity: 1 },
  coachingRules: ["path_deviation"],
  sceneConfig: {
    sceneId: "needle-passing-scene",
    targetIds: ["ring-1"],
    dangerZoneIds: [],
  },
};

export const sampleReferenceMotion: ReferenceMotion = {
  schemaVersion: DATA_SCHEMA_VERSION,
  id: "needle-passing-ref-v1",
  skillId: "needle-passing",
  sourceType: "internal-recording",
  sourceName: "fixture",
  coordinateSystem: COORDINATE_SYSTEM,
  fps: 30,
  segments: [{ id: "approach", startMs: 0, endMs: 1000 }],
  frames: [
    makeMotionFrame({ tMs: 0, normalizedProgress: 0 }),
    makeMotionFrame({
      tMs: 1000,
      normalizedProgress: 1,
      segmentId: "approach",
    }),
  ],
};

export const sampleAttemptResult: AttemptResult = {
  schemaVersion: DATA_SCHEMA_VERSION,
  id: "attempt-fixture-1",
  skillId: "needle-passing",
  mode: "practice",
  createdAt: "2026-10-16T00:00:00.000Z",
  durationMs: 12_000,
  referenceMotionId: "needle-passing-ref-v1",
  performance: perfectPerformance,
  categoryScores: {
    precision: 100,
    control: 100,
    technique: 100,
    coordination: 100,
    efficiencySafety: 100,
  },
  overallScore: 100,
  importantEvents: [],
  worstMoments: [],
};
