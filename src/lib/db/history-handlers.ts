import {
  deleteUserHistory,
  getUserProgressOverview,
  type HistoryStatus,
} from "@/lib/db/progress-queries";
import type { ProgressOverview } from "@/types/progress";
import { createRateLimiter, type RateLimiter } from "@/lib/voice/rate-limit";
import { rateLimitRequest } from "@/lib/reliability/request-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public read/mutate routes get the same per-instance IP limiter as uploads and
// speech (plan 3.4). The delete limit is tighter because it is a mutation.
const progressLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const deleteLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function requireUser(request: Request): string | Response {
  const anonymousUserId = new URL(request.url).searchParams
    .get("anonymousUserId")
    ?.trim();
  if (!anonymousUserId || !UUID.test(anonymousUserId)) {
    return Response.json(
      { error: "anonymousUserId is required" },
      { status: 400 },
    );
  }
  return anonymousUserId;
}

export interface ProgressHandlerDeps {
  getProgress?: (anonymousUserId: string) => Promise<ProgressOverview | null>;
  rateLimiter?: RateLimiter;
}

/**
 * GET /api/progress?anonymousUserId=… — per-skill progress for the anonymous
 * user. Returns 503 when Tiger is unconfigured/unreachable so the page can
 * degrade to a local-only notice.
 */
export async function handleProgressRequest(
  request: Request,
  deps: ProgressHandlerDeps = {},
): Promise<Response> {
  const limited = rateLimitRequest(
    request,
    deps.rateLimiter ?? progressLimiter,
  );
  if (limited) return limited;
  const user = requireUser(request);
  if (user instanceof Response) return user;

  const progress = await (
    deps.getProgress ?? ((id: string) => getUserProgressOverview(id))
  )(user);
  if (progress === null) {
    return Response.json(
      { error: "cloud sync not configured" },
      { status: 503 },
    );
  }
  return Response.json(progress, { headers: { "Cache-Control": "no-store" } });
}

export interface DeleteHandlerDeps {
  deleteHistory?: (anonymousUserId: string) => Promise<HistoryStatus>;
  rateLimiter?: RateLimiter;
}

/**
 * DELETE /api/attempts?anonymousUserId=… — erase the anonymous user's attempt
 * history from Tiger (B10 acceptance). 503 when unconfigured, 502 on a failed
 * write so the client can keep its local copies and surface the failure.
 */
export async function handleDeleteHistory(
  request: Request,
  deps: DeleteHandlerDeps = {},
): Promise<Response> {
  const limited = rateLimitRequest(request, deps.rateLimiter ?? deleteLimiter);
  if (limited) return limited;
  const user = requireUser(request);
  if (user instanceof Response) return user;

  const status = await (
    deps.deleteHistory ?? ((id: string) => deleteUserHistory(id))
  )(user);
  if (status === "synced") return Response.json({ status: "deleted" });
  if (status === "unconfigured")
    return Response.json(
      { error: "cloud sync not configured" },
      { status: 503 },
    );
  return Response.json({ error: "delete failed" }, { status: 502 });
}
