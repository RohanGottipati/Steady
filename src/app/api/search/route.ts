import { handleCoachingSearch } from "@/lib/db/search-handlers";

/**
 * GET /api/search?skillId=…&q=… — BM25 coaching-document retrieval over the
 * seeded corpus (B12 pg_textsearch). An empty match set is a valid 200.
 */
export async function GET(request: Request): Promise<Response> {
  return handleCoachingSearch(request);
}
