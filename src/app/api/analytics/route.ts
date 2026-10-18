import { handleDeviationAnalytics } from "@/lib/db/search-handlers";

/**
 * GET /api/analytics?attemptId=… — percentile/time-weighted deviation stats and
 * the LTTB-downsampled deviation series for an attempt (B12 hyperfunctions).
 * Degrades to 503 when neither Tiger telemetry nor analytics are available.
 */
export async function GET(request: Request): Promise<Response> {
  return handleDeviationAnalytics(request);
}
