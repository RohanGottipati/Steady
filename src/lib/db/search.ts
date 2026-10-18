import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";

type SqlLike = ReturnType<typeof postgres>;

/** A coaching document retrieved from the corpus to ground the AI review. */
export interface CoachingDocument {
  id: string;
  title: string;
  content: string;
}

export interface SearchDeps {
  /** Injectable SQL client for tests; defaults to the Tiger singleton. */
  sql?: SqlLike | null;
  /** Max documents to return. */
  limit?: number;
}

/**
 * B12 full-text retrieval (plan 18.5): rank the skill's coaching documents
 * against a free-text query with the BM25 index (`skill_documents_bm25_idx`).
 * pg_textsearch returns a negative BM25 score for matches and 0 for non-matches,
 * so matches are `< 0` and best-first is ascending. Returns `[]` when Tiger is
 * unconfigured/unreachable, the query is blank, or anything fails; never throws.
 */
export async function searchCoachingDocuments(
  skillId: string,
  queryText: string,
  deps: SearchDeps = {},
): Promise<CoachingDocument[]> {
  const query = queryText.trim();
  if (!query) return [];
  const sql = deps.sql === undefined ? getDb() : deps.sql;
  if (!sql) return [];
  const limit = Math.max(1, Math.min(deps.limit ?? 3, 10));

  try {
    const rows = await sql<{ id: string; title: string; content: string }[]>`
      select id::text as id, title, content,
             (content <@> to_bm25query(${query}, 'skill_documents_bm25_idx')) as score
      from skill_documents
      where skill_id = ${skillId}
        and (content <@> to_bm25query(${query}, 'skill_documents_bm25_idx')) < 0
      order by score asc
      limit ${limit}
    `;
    return rows.map(r => ({ id: r.id, title: r.title, content: r.content }));
  } catch {
    return [];
  }
}
