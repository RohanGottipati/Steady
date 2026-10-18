import { findSimilarAttempts, type SimilarAttempt } from "@/lib/db/similarity";
import { searchCoachingDocuments, type CoachingDocument } from "@/lib/db/search";
import {
  getAttemptDeviationStats,
  getDownsampledDeviation,
  type DeviationStats,
  type SeriesPoint,
} from "@/lib/db/analytics";
import { createRateLimiter, type RateLimiter } from "@/lib/voice/rate-limit";
import { rateLimitRequest } from "@/lib/reliability/request-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKILL_ID = /^[a-z0-9-]{1,64}$/;
const MAX_QUERY_LEN = 200;

// Public read routes get the same per-instance IP limiter as progress (plan 3.4).
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

function param(request: Request, name: string): string {
  return new URL(request.url).searchParams.get(name)?.trim() ?? "";
}

export interface SimilarAttemptsDeps {
  findSimilar?: (attemptId: string) => Promise<SimilarAttempt[] | null>;
  rateLimiter?: RateLimiter;
}

/**
 * GET /api/similar-attempts?attemptId=… — prior attempts with the nearest
 * performance profile (B12 vector similarity). 503 when Tiger is unavailable.
 */
export async function handleSimilarAttempts(
  request: Request,
  deps: SimilarAttemptsDeps = {},
): Promise<Response> {
  const limited = rateLimitRequest(request, deps.rateLimiter ?? limiter);
  if (limited) return limited;

  const attemptId = param(request, "attemptId");
  if (!UUID.test(attemptId)) {
    return Response.json({ error: "attemptId is required" }, { status: 400 });
  }
  const similar = await (deps.findSimilar ?? (id => findSimilarAttempts(id)))(attemptId);
  if (similar === null) {
    return Response.json({ error: "cloud sync not configured" }, { status: 503 });
  }
  return Response.json({ similar });
}

export interface CoachingSearchDeps {
  search?: (skillId: string, query: string) => Promise<CoachingDocument[]>;
  rateLimiter?: RateLimiter;
}

/**
 * GET /api/search?skillId=…&q=… — BM25 coaching-document retrieval (B12). An
 * empty result set is a valid 200; the corpus simply had no match.
 */
export async function handleCoachingSearch(
  request: Request,
  deps: CoachingSearchDeps = {},
): Promise<Response> {
  const limited = rateLimitRequest(request, deps.rateLimiter ?? limiter);
  if (limited) return limited;

  const skillId = param(request, "skillId");
  const query = param(request, "q").slice(0, MAX_QUERY_LEN);
  if (!SKILL_ID.test(skillId) || !query) {
    return Response.json({ error: "skillId and q are required" }, { status: 400 });
  }
  const documents = await (deps.search ?? ((s, q) => searchCoachingDocuments(s, q)))(skillId, query);
  return Response.json({ documents });
}

export interface DeviationAnalyticsDeps {
  getStats?: (attemptId: string) => Promise<DeviationStats | null>;
  getSeries?: (attemptId: string) => Promise<SeriesPoint[] | null>;
  points?: number;
  rateLimiter?: RateLimiter;
}

/**
 * GET /api/analytics?attemptId=… — percentile/time-weighted deviation stats and
 * the LTTB-downsampled deviation series for an attempt's replay chart (B12).
 * 503 when neither is available (unconfigured or no telemetry).
 */
export async function handleDeviationAnalytics(
  request: Request,
  deps: DeviationAnalyticsDeps = {},
): Promise<Response> {
  const limited = rateLimitRequest(request, deps.rateLimiter ?? limiter);
  if (limited) return limited;

  const attemptId = param(request, "attemptId");
  if (!UUID.test(attemptId)) {
    return Response.json({ error: "attemptId is required" }, { status: 400 });
  }
  const [stats, series] = await Promise.all([
    (deps.getStats ?? (id => getAttemptDeviationStats(id)))(attemptId),
    (deps.getSeries ?? (id => getDownsampledDeviation(id, { points: deps.points })))(attemptId),
  ]);
  if (stats === null && series === null) {
    return Response.json({ error: "analytics unavailable" }, { status: 503 });
  }
  return Response.json({ stats, series });
}
