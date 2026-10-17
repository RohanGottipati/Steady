import { z } from "zod";

/**
 * Stable 20-metric ordering for `vector(20)` Tiger persistence.
 * Canonical names follow IMPLEMENTATION_PLAN §6.9 / §13.3 (not the stale aliases in §6.11).
 * Any reordering is a schema migration — update conversion, DB assumptions, tests, and CONTEXT.md.
 */
export const PERFORMANCE_VECTOR_ORDER = [
  "pathSimilarity",
  "targetAccuracy",
  "depthConsistency",
  "instrumentOrientationAccuracy",
  "movementSmoothness",
  "pathEfficiency",
  "motionStability",
  "overshootControl",
  "correctionEfficiency",
  "rotationControlAccuracy",
  "pinchStability",
  "gripTiming",
  "handWorkspaceControl",
  "bimanualCoordination",
  "segmentTiming",
  "speedProfileControl",
  "idleTimeControl",
  "toolCollisionAvoidance",
  "dangerZoneAvoidance",
  "proceduralSequencing",
] as const;

export type PerformanceMetricId = (typeof PERFORMANCE_VECTOR_ORDER)[number];

export const performanceMetricIdSchema = z.enum(PERFORMANCE_VECTOR_ORDER);

const scoreSchema = z.number().min(0).max(100);

export const performanceVectorSchema = z.object({
  pathSimilarity: scoreSchema,
  targetAccuracy: scoreSchema,
  depthConsistency: scoreSchema,
  instrumentOrientationAccuracy: scoreSchema,
  movementSmoothness: scoreSchema,
  pathEfficiency: scoreSchema,
  motionStability: scoreSchema,
  overshootControl: scoreSchema,
  correctionEfficiency: scoreSchema,
  rotationControlAccuracy: scoreSchema,
  pinchStability: scoreSchema,
  gripTiming: scoreSchema,
  handWorkspaceControl: scoreSchema,
  bimanualCoordination: scoreSchema,
  segmentTiming: scoreSchema,
  speedProfileControl: scoreSchema,
  idleTimeControl: scoreSchema,
  toolCollisionAvoidance: scoreSchema,
  dangerZoneAvoidance: scoreSchema,
  proceduralSequencing: scoreSchema,
});

export type PerformanceVector = z.infer<typeof performanceVectorSchema>;

export const categoryScoresSchema = z.object({
  precision: scoreSchema,
  control: scoreSchema,
  technique: scoreSchema,
  coordination: scoreSchema,
  efficiencySafety: scoreSchema,
});

export type CategoryScores = z.infer<typeof categoryScoresSchema>;

/** Metric id groups that roll up into the five category scores (§13.4). */
export const CATEGORY_METRIC_IDS = {
  precision: [
    "pathSimilarity",
    "targetAccuracy",
    "depthConsistency",
    "instrumentOrientationAccuracy",
  ],
  control: [
    "movementSmoothness",
    "pathEfficiency",
    "motionStability",
    "overshootControl",
    "correctionEfficiency",
  ],
  technique: [
    "rotationControlAccuracy",
    "pinchStability",
    "gripTiming",
    "handWorkspaceControl",
  ],
  coordination: ["bimanualCoordination", "toolCollisionAvoidance"],
  efficiencySafety: [
    "segmentTiming",
    "speedProfileControl",
    "idleTimeControl",
    "dangerZoneAvoidance",
    "proceduralSequencing",
  ],
} as const satisfies Record<keyof CategoryScores, readonly PerformanceMetricId[]>;

export const metricResultSchema = z.object({
  id: z.string().min(1),
  score: scoreSchema,
  rawValue: z.number(),
  unit: z.string().optional(),
  tolerance: z.number().optional(),
  segmentId: z.string().optional(),
  evidence: z
    .object({
      startMs: z.number().optional(),
      endMs: z.number().optional(),
      frameIndex: z.number().int().optional(),
    })
    .optional(),
});

export type MetricResult = z.infer<typeof metricResultSchema>;

export const replayMarkerSchema = z.object({
  tMs: z.number().nonnegative(),
  segmentId: z.string().min(1),
  metricId: z.string().min(1),
  severity: z.number().min(0).max(1),
  explanationData: z.record(
    z.string(),
    z.union([z.number(), z.string(), z.boolean()]),
  ),
});

export type ReplayMarker = z.infer<typeof replayMarkerSchema>;

export function performanceVectorToArray(
  vector: PerformanceVector,
): number[] {
  return PERFORMANCE_VECTOR_ORDER.map((key) => vector[key]);
}

export function performanceVectorFromArray(
  values: readonly number[],
): PerformanceVector {
  if (values.length !== PERFORMANCE_VECTOR_ORDER.length) {
    throw new Error(
      `Expected ${PERFORMANCE_VECTOR_ORDER.length} metric values, got ${values.length}`,
    );
  }
  const entries = PERFORMANCE_VECTOR_ORDER.map((key, index) => [
    key,
    values[index],
  ] as const);
  return performanceVectorSchema.parse(Object.fromEntries(entries));
}
