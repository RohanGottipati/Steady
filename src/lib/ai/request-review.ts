import type { CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import { type AiReview } from "@/types/ai";
import { buildDeterministicReview } from "./deterministic-review";
import { REVIEW_UNAVAILABLE, reviewRequestSchema, validatedReview, type ReviewRequest } from "./review-contract";

export interface AttemptReview {
  source: "deterministic" | "model";
  review: AiReview;
  notice: string | null;
}

export function reviewRequestFromBundle(bundle: CompletedAttemptBundle): ReviewRequest {
  return reviewRequestSchema.parse({
    skillId: bundle.attemptResult.skillId,
    mode: bundle.attemptResult.mode,
    overallScore: bundle.attemptResult.overallScore,
    categoryScores: bundle.attemptResult.categoryScores,
    strongest: {
      id: bundle.strongestMetric.id,
      score: bundle.strongestMetric.score,
      explanation: bundle.strongestMetric.explanation,
    },
    weakest: {
      id: bundle.weakestMetric.id,
      score: bundle.weakestMetric.score,
      explanation: bundle.weakestMetric.explanation,
    },
    metrics: bundle.evaluation.metrics.map(metric => ({ ...metric,
      explanation: bundle.evaluation.explanations.find(item => item.id === metric.id)?.text ?? "",
    })),
    worstMoments: bundle.attemptResult.worstMoments.slice(0, 3),
  });
}

function localReview(bundle: CompletedAttemptBundle): AiReview {
  return buildDeterministicReview(bundle);
}

/**
 * Asks `/api/review` for an explanation of the supplied metrics.
 * Any failure, including speech-unrelated network loss, keeps the deterministic notes.
 * The returned review never replaces `bundle.attemptResult` scores.
 */
export async function requestAttemptReview(
  bundle: CompletedAttemptBundle,
  options: { fetchFn?: typeof fetch; enabled?: boolean; endpoint?: string } = {},
): Promise<AttemptReview> {
  const review = localReview(bundle);
  const enabled = options.enabled ?? process.env.NEXT_PUBLIC_ENABLE_AI_REVIEW !== "false";
  if (!enabled) return { source: "deterministic", review, notice: null };
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const request = reviewRequestFromBundle(bundle);
    const response = await fetchFn(options.endpoint ?? "/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 204) return { source: "deterministic", review, notice: null };
    if (!response.ok) return { source: "deterministic", review, notice: REVIEW_UNAVAILABLE };
    const accepted = validatedReview(await response.json(), request);
    if (!accepted) return { source: "deterministic", review, notice: REVIEW_UNAVAILABLE };
    return { source: "model", review: accepted, notice: null };
  } catch {
    return { source: "deterministic", review, notice: REVIEW_UNAVAILABLE };
  }
}
