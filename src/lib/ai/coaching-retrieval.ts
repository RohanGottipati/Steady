import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";
import { searchCoachingDocuments, type CoachingDocument } from "@/lib/db/search";

type SqlLike = ReturnType<typeof postgres>;

export type { CoachingDocument };

export interface RetrievalOptions {
  /** Injectable SQL client for tests; falls back to the Tiger singleton. */
  sql?: SqlLike | null;
  /** Max documents to return. */
  limit?: number;
}

/** Split a canonical camelCase metric id into lowercase search words. */
function metricIdToTerms(metricId: string): string {
  return metricId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

/**
 * B9/B12 Tiger retrieval hook: fetch skill/error-specific coaching documents to
 * ground the AI review. B12 ranks the corpus with the `pg_textsearch` BM25 index
 * (see {@link searchCoachingDocuments}); the weak-metric ids are expanded into
 * natural-language search terms ("movementSmoothness" → "movement smoothness").
 *
 * Returns `[]` whenever Tiger is unconfigured, unreachable, the corpus is empty,
 * no metrics are supplied, or any query fails, so the review degrades to a
 * metrics-only prompt (B9 acceptance). It never throws.
 */
export async function retrieveCoachingContext(
  skillId: string,
  metricIds: string[],
  options: RetrievalOptions = {},
): Promise<CoachingDocument[]> {
  const query = metricIds.slice(0, 5).map(metricIdToTerms).filter(Boolean).join(" ");
  if (!query) return [];
  const sql = options.sql === undefined ? getDb() : options.sql;
  return searchCoachingDocuments(skillId, query, { sql, limit: options.limit ?? 3 });
}
