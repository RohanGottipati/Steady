import type {
  CategoryScores,
  MetricResult,
  PerformanceMetricId,
  PerformanceVector,
  ReplayMarker,
} from "@/types/evaluation";
import type { CoachingEvent } from "@/types/coaching";
import type { MotionFrame } from "@/types/motion";
import type { TrainingMode } from "@/types/skill";
import type { EvaluationScene } from "./context";

// A recorded user attempt: the same frame shape as a reference motion. Produced
// live by the exercise engine; in tests it is derived from a reference fixture.
export type RecordedMotion = {
  skillId: string;
  frames: MotionFrame[];
};

/** A deterministic, factual one-line summary of a single metric result. */
export type MetricExplanation = {
  id: PerformanceMetricId;
  score: number;
  text: string;
};

export type EvaluationOptions = {
  /** Per-metric weights (id → weight) for the overall and category scores. Defaults to 1. */
  metricWeights?: Record<string, number>;
  /** Optional scene geometry for safety/collision metrics (A4 supplies this). */
  scene?: EvaluationScene;
};

// B5 output: the full 20-metric set, the keyed performance vector for `vector(20)`
// persistence, all five category scores, the weighted overall, worst-moment
// markers, and a deterministic explanation per metric.
export type EvaluationResult = {
  metrics: MetricResult[];
  performance: PerformanceVector;
  categoryScores: CategoryScores;
  overallScore: number;
  worstMoments: ReplayMarker[];
  explanations: MetricExplanation[];
};

/** Session metadata the evaluator does not own, needed to assemble an AttemptResult. */
export type AttemptMeta = {
  id: string;
  skillId: string;
  mode: TrainingMode;
  createdAt: string;
  durationMs: number;
  referenceMotionId: string;
  importantEvents?: CoachingEvent[];
};
