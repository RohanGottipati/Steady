import {
  CATEGORY_METRIC_IDS,
  PERFORMANCE_VECTOR_ORDER,
  type CategoryScores,
  type MetricResult,
  type PerformanceMetricId,
  type PerformanceVector,
  type ReplayMarker,
  performanceVectorFromArray,
} from "@/types/evaluation";
import type { AttemptResult } from "@/types/attempt";
import { DATA_SCHEMA_VERSION } from "@/types/schema-version";
import type { ReferenceMotion } from "@/types/motion";
import { type AlignedSample, alignBySegment } from "./align";
import type { MetricContext } from "./context";
import {
  bimanualCoordination,
  correctionEfficiency,
  dangerZoneAvoidance,
  depthConsistency,
  gripTiming,
  handWorkspaceControl,
  idleTimeControl,
  motionStability,
  overshootControl,
  pinchStability,
  rotationControlAccuracy,
  toolCollisionAvoidance,
} from "./metrics-extra";
import {
  instrumentOrientationAccuracy,
  movementSmoothness,
  pathEfficiency,
  pathSimilarity,
  proceduralSequencing,
  segmentTiming,
  speedProfileControl,
  targetAccuracy,
} from "./metrics";
import { quatAngleDeg, tipDistance } from "./score";
import type {
  AttemptMeta,
  EvaluationOptions,
  EvaluationResult,
  MetricExplanation,
  RecordedMotion,
} from "./types";

type MetricFn = (ctx: MetricContext) => MetricResult;

// All 20 metric functions keyed by id (B3 core + B5 extras). Registered
// explicitly so adding/renaming a metric is a compile-time decision.
const METRIC_FNS: Record<PerformanceMetricId, MetricFn> = {
  pathSimilarity,
  targetAccuracy,
  depthConsistency,
  instrumentOrientationAccuracy,
  movementSmoothness,
  pathEfficiency,
  motionStability,
  overshootControl,
  correctionEfficiency,
  rotationControlAccuracy,
  pinchStability,
  gripTiming,
  handWorkspaceControl,
  bimanualCoordination,
  segmentTiming,
  speedProfileControl,
  idleTimeControl,
  toolCollisionAvoidance,
  dangerZoneAvoidance,
  proceduralSequencing,
};

function weightedMean(
  ids: readonly PerformanceMetricId[],
  score: (id: PerformanceMetricId) => number,
  weights: Record<string, number> | undefined,
): number {
  let num = 0;
  let den = 0;
  for (const id of ids) {
    const w = weights?.[id] ?? 1;
    num += w * score(id);
    den += w;
  }
  return den > 0 ? num / den : 0;
}

// Deterministic evaluation of a recorded attempt against a reference motion.
// Produces the full 20-metric vector, weighted category/overall scores,
// worst-moment markers, and a factual explanation per metric.
export function evaluateAttempt(
  user: RecordedMotion,
  reference: ReferenceMotion,
  options: EvaluationOptions = {},
): EvaluationResult {
  const samples = alignBySegment(reference, user);
  const ctx: MetricContext = { samples, reference, user, scene: options.scene ?? {} };

  const metrics: MetricResult[] = PERFORMANCE_VECTOR_ORDER.map((id) => METRIC_FNS[id](ctx));
  const byId = new Map(metrics.map((m) => [m.id, m.score]));
  const scoreById = (id: PerformanceMetricId) => byId.get(id) ?? 0;

  const performance: PerformanceVector = performanceVectorFromArray(
    PERFORMANCE_VECTOR_ORDER.map(scoreById),
  );

  const categoryScores = {} as CategoryScores;
  for (const [category, ids] of Object.entries(CATEGORY_METRIC_IDS)) {
    categoryScores[category as keyof CategoryScores] = Math.round(
      weightedMean(ids, scoreById, options.metricWeights),
    );
  }

  const overallScore = Math.round(
    weightedMean(PERFORMANCE_VECTOR_ORDER, scoreById, options.metricWeights),
  );

  return {
    metrics,
    performance,
    categoryScores,
    overallScore,
    worstMoments: worstMoments(samples),
    explanations: metrics.map(explain),
  };
}

// Assemble a schema-valid AttemptResult from an evaluation plus the session
// metadata and coaching events the evaluator does not own.
export function toAttemptResult(
  evaluation: EvaluationResult,
  meta: AttemptMeta,
): AttemptResult {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: meta.id,
    skillId: meta.skillId,
    mode: meta.mode,
    createdAt: meta.createdAt,
    durationMs: meta.durationMs,
    referenceMotionId: meta.referenceMotionId,
    performance: evaluation.performance,
    categoryScores: evaluation.categoryScores,
    overallScore: evaluation.overallScore,
    importantEvents: meta.importantEvents ?? [],
    worstMoments: evaluation.worstMoments,
  };
}

// Factual, deterministic summary — the AI review layer (B9) elaborates on this;
// it never recomputes the numbers.
function explain(m: MetricResult): MetricExplanation {
  if (m.id === "segmentTiming") {
    return {
      id: "segmentTiming",
      score: m.score,
      text: `Step timing balance differs from the guide by ${Math.round(m.rawValue * 100)}%. This compares the share of active time spent on each step; overall speed is not scored.`,
    };
  }
  const parts = [`${m.id}: ${m.score}/100`];
  if (m.unit !== undefined) parts.push(`${round(m.rawValue)} ${m.unit}`);
  if (m.tolerance !== undefined) parts.push(`tolerance ${round(m.tolerance)}`);
  return { id: m.id as PerformanceMetricId, score: m.score, text: parts.join(" · ") };
}

// Top-3 deviations for replay markers (plan 13.5). Severity is the normalized
// position/orientation error at the worst aligned samples.
function worstMoments(samples: AlignedSample[]): ReplayMarker[] {
  const POS_REF = 0.3;
  const ANG_REF = 90;
  const candidates: ReplayMarker[] = [];
  for (const s of samples) {
    const posErr =
      (tipDistance(s.ref.left.tipPosition, s.user.left.tipPosition) +
        tipDistance(s.ref.right.tipPosition, s.user.right.tipPosition)) / 2;
    const angErr =
      (quatAngleDeg(s.ref.left.rotation, s.user.left.rotation) +
        quatAngleDeg(s.ref.right.rotation, s.user.right.rotation)) / 2;
    const posSev = Math.min(1, posErr / POS_REF);
    const angSev = Math.min(1, angErr / ANG_REF);
    if (posSev >= angSev) {
      candidates.push({
        tMs: s.refTMs,
        segmentId: s.segmentId,
        metricId: "pathSimilarity",
        severity: posSev,
        explanationData: { tipErrorUnits: round(posErr) },
      });
    } else {
      candidates.push({
        tMs: s.refTMs,
        segmentId: s.segmentId,
        metricId: "instrumentOrientationAccuracy",
        severity: angSev,
        explanationData: { orientationErrorDeg: round(angErr) },
      });
    }
  }
  return candidates
    .filter((c) => c.severity > 0.01)
    .sort((a, b) => b.severity - a.severity || a.tMs - b.tMs)
    .slice(0, 3);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
