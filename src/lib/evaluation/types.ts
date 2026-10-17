import type { CategoryScores, MetricResult, ReplayMarker } from "@/types/evaluation";
import type { MotionFrame } from "@/types/motion";

// A recorded user attempt: the same frame shape as a reference motion. Produced
// live by the exercise engine; in tests it is derived from a reference fixture.
export type RecordedMotion = {
  skillId: string;
  frames: MotionFrame[];
};

// B3 output. Only the implemented (B3) metrics appear in `metrics`, and only
// categories that have at least one implemented metric appear in
// `categoryScores` (partial until B5 completes the 20-metric set).
export type EvaluationResult = {
  metrics: MetricResult[];
  categoryScores: Partial<CategoryScores>;
  overallScore: number;
  worstMoments: ReplayMarker[];
};
