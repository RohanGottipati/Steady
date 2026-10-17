import { requestBackboardReview, ReviewUnavailableError } from "@/lib/ai/backboard-review";
import { reviewRequestSchema } from "@/lib/ai/review-contract";

/**
 * POST /api/review — optional Backboard explanation of supplied metrics.
 * Missing config, upstream failure, and malformed JSON all return a non-2xx
 * response. The client keeps the deterministic notes already on the attempt.
 */
export async function handleReviewRequest(
  request: Request,
  deps: {
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
  },
): Promise<Response> {
  const env = deps.env ?? process.env;
  try {
    if (env.NEXT_PUBLIC_ENABLE_AI_REVIEW === "false" || !env.BACKBOARD_API_KEY?.trim()) {
      return Response.json({ error: "review unavailable", persistence: "deterministic" }, { status: 503 });
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const parsed = reviewRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json({ error: "invalid request" }, { status: 400 });
    }
    const review = await requestBackboardReview(parsed.data, { fetchFn: deps.fetchFn, env });
    return Response.json(review);
  } catch (error) {
    if (error instanceof ReviewUnavailableError) {
      return Response.json({ error: "review unavailable", persistence: "deterministic" }, { status: 503 });
    }
    return Response.json({ error: "review unavailable", persistence: "deterministic" }, { status: 503 });
  }
}
