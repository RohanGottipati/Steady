import { requestBackboardReview, ReviewUnavailableError } from "@/lib/ai/backboard-review";
import { retrieveCoachingContext } from "@/lib/ai/coaching-retrieval";
import { reviewRequestSchema } from "@/lib/ai/review-contract";
import { createRateLimiter, type RateLimiter } from "@/lib/voice/rate-limit";
import { rateLimitRequest, readLimitedJson, RequestBodyError } from "@/lib/reliability/request-guards";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
export const MAX_REVIEW_BODY_BYTES = 64 * 1024;

/**
 * POST /api/review — optional Backboard explanation of supplied metrics.
 * Missing config is an optional no-op (204). Configured provider failures keep
 * deterministic notes with a notice. Request limits precede reading the body.
 */
export async function handleReviewRequest(
  request: Request,
  deps: {
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
    rateLimiter?: RateLimiter;
  },
): Promise<Response> {
  const env = deps.env ?? process.env;
  try {
    if (env.NEXT_PUBLIC_ENABLE_AI_REVIEW === "false" || !env.BACKBOARD_API_KEY?.trim()) {
      return new Response(null, { status: 204 });
    }
    const limited = rateLimitRequest(request, deps.rateLimiter ?? limiter);
    if (limited) return limited;
    let payload: unknown;
    try {
      payload = await readLimitedJson(request, MAX_REVIEW_BODY_BYTES);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "invalid JSON body" },
        { status: error instanceof RequestBodyError ? error.status : 400 });
    }
    const parsed = reviewRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json({ error: "invalid request" }, { status: 400 });
    }
    // Retrieval degrades to [] on any failure — never blocks the review.
    const coachingContext = await retrieveCoachingContext(
      parsed.data.skillId,
      [parsed.data.weakest.id, ...parsed.data.worstMoments.map(m => m.metricId)],
    );
    const review = await requestBackboardReview(parsed.data, {
      fetchFn: deps.fetchFn,
      env,
      coachingContext,
    });
    return Response.json(review);
  } catch (error) {
    if (error instanceof ReviewUnavailableError) {
      return Response.json({ error: "review unavailable", persistence: "deterministic" }, { status: 503 });
    }
    return Response.json({ error: "review unavailable", persistence: "deterministic" }, { status: 503 });
  }
}
