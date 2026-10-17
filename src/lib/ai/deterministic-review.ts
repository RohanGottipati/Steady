import type { CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import { metricLabel } from "@/lib/evaluation/metric-labels";
import { selectFocusMarker } from "@/lib/evaluation/focus-marker";
import type { AiReview, MetricResult } from "@/types";

/**
 * Build a deterministic, metrics-grounded {@link AiReview} directly from a completed
 * attempt — no generative model involved.
 *
 * This is B8's AI-review *fallback*: it renders immediately in the results UI and
 * satisfies the exact `aiReviewSchema` contract, so B9's Backboard/Gemini review can
 * either replace it or degrade to it (service disabled, offline, or malformed output)
 * without the results page losing its explanation section. Every sentence restates a
 * number the deterministic evaluator already produced; nothing here is invented.
 */
export function buildDeterministicReview(bundle: CompletedAttemptBundle): AiReview {
  const { attemptResult, evaluation, strongestMetric, weakestMetric } = bundle;
  const explanationById = new Map<string, string>(evaluation.explanations.map(e => [e.id, e.text]));
  const explain = (m: Pick<MetricResult, "id" | "score">) =>
    explanationById.get(m.id) ?? `${metricLabel(m.id)}: ${m.score}/100`;

  const summary =
    `Overall kinematic similarity ${attemptResult.overallScore}/100 across 20 deterministic motion metrics. ` +
    `Strongest: ${metricLabel(strongestMetric.id)} (${strongestMetric.score}/100). ` +
    `Primary focus: ${metricLabel(weakestMetric.id)} (${weakestMetric.score}/100).`;

  // Relative strengths: the three highest-scoring metrics (always ≥ 1 of 20).
  const byScoreDesc = [...evaluation.metrics].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const strengths = byScoreDesc.slice(0, 3).map(explain);

  // Improvements: lowest-scoring metrics first, seeded with the global weakest so the
  // top improvement always restates the weakest metric's evidence. A perfect attempt
  // (nothing below reference) still needs one line to satisfy the schema.
  const improvements: string[] = [];
  const pushed = new Set<string>();
  const addImprovement = (m: Pick<MetricResult, "id" | "score">) => {
    if (improvements.length >= 3 || pushed.has(m.id) || m.score >= 100) return;
    pushed.add(m.id);
    improvements.push(explain(m));
  };
  addImprovement(weakestMetric);
  for (const metric of [...byScoreDesc].reverse()) addImprovement(metric);
  if (improvements.length === 0) {
    improvements.push(
      "Every metric matched the reference trajectory. Maintain this consistency and progress to a faster target pace.",
    );
  }

  // Largest difference: the top worst-moment marker if one exists, else the weakest metric.
  const topMoment = selectFocusMarker(attemptResult.worstMoments);
  const largestDifference = topMoment
    ? {
        segmentId: topMoment.segmentId,
        explanation:
          `${metricLabel(topMoment.metricId)} showed the largest deviation during the ` +
          `${topMoment.segmentId} segment (severity ${Math.round(topMoment.severity * 100)}%). ` +
          explain(evaluation.metrics.find(metric => metric.id === topMoment.metricId) ?? weakestMetric),
      }
    : {
        segmentId: weakestMetric.segmentId ?? "overall",
        explanation: explain(weakestMetric),
      };

  const replayNarration = !topMoment && weakestMetric.score >= 100
    ? "Every measured metric matched the canonical scene guide. Use the replay to review the recorded movement."
    : `In the replay, the largest gap from the reference appears in the ${largestDifference.segmentId} segment. ` +
      `${largestDifference.explanation} Watch that segment and compare your instrument path against the reference guide.`;

  return { summary, strengths, improvements, largestDifference, replayNarration };
}
