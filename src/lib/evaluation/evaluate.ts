import { CATEGORY_METRIC_IDS, type CategoryScores, type MetricResult, type ReplayMarker } from "@/types/evaluation";
import type { ReferenceMotion } from "@/types/motion";
import { type AlignedSample, alignBySegment } from "./align";
import { B3_METRICS } from "./metrics";
import { quatAngleDeg, tipDistance } from "./score";
import type { EvaluationResult, RecordedMotion } from "./types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Deterministic evaluation of a recorded attempt against a reference motion.
// B3 implements 8 of 20 metrics; category scores and overall cover only those.
export function evaluateAttempt(
  user: RecordedMotion,
  reference: ReferenceMotion,
): EvaluationResult {
  const samples = alignBySegment(reference, user);
  const ctx = { samples, reference, user };

  const metrics: MetricResult[] = B3_METRICS.map((metric) => metric(ctx));
  const byId = new Map(metrics.map((m) => [m.id, m.score]));

  const categoryScores: Partial<CategoryScores> = {};
  for (const [category, ids] of Object.entries(CATEGORY_METRIC_IDS)) {
    const present = ids.filter((id) => byId.has(id)).map((id) => byId.get(id) as number);
    if (present.length > 0) {
      categoryScores[category as keyof CategoryScores] = Math.round(mean(present));
    }
  }

  const overallScore = Math.round(mean(metrics.map((m) => m.score)));

  return {
    metrics,
    categoryScores,
    overallScore,
    worstMoments: worstMoments(samples),
  };
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
