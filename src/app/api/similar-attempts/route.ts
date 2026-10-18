import { handleSimilarAttempts } from "@/lib/db/search-handlers";

/**
 * GET /api/similar-attempts?attemptId=…&anonymousUserId=… — the user's own prior
 * attempts whose 20D performance profile is nearest to the given attempt (B12
 * StreamingDiskANN similarity). Degrades to 503 when Tiger is unavailable.
 */
export async function GET(request: Request): Promise<Response> {
  return handleSimilarAttempts(request);
}
