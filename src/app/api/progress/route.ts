import { handleProgressRequest } from "@/lib/db/history-handlers";

/**
 * GET /api/progress?anonymousUserId=… — per-skill progress served from the
 * compact `attempt_scores` rows (plan §18.11, B10). Never scans raw motion
 * samples; degrades to 503 when Tiger is unavailable.
 */
export async function GET(request: Request): Promise<Response> {
  return handleProgressRequest(request);
}
