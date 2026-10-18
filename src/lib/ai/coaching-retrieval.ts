import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";

type SqlLike = ReturnType<typeof postgres>;

/** Skill/error coaching text retrieved from Tiger to ground the AI review. */
export interface CoachingDocument {
  id: string;
  title: string;
  content: string;
}

export interface RetrievalOptions {
  /** Injectable SQL client for tests; falls back to the Tiger singleton. */
  sql?: SqlLike | null;
  /** Max documents to return. */
  limit?: number;
}

/**
 * B9 Tiger retrieval hook: fetch skill/error-specific coaching documents to ground
 * the AI review. Returns `[]` whenever Tiger is unconfigured, unreachable, the corpus
 * is empty, or any query fails, so the review degrades to a metrics-only prompt
 * (B9 acceptance: "Tiger retrieval failures degrade gracefully to metrics-only review").
 * It never throws.
 *
 * B12 replaces the plain text match below with a `pg_textsearch` BM25 query over the
 * seeded coaching corpus without changing this signature.
 */
export async function retrieveCoachingContext(
  skillId: string,
  metricIds: string[],
  options: RetrievalOptions = {},
): Promise<CoachingDocument[]> {
  const sql = options.sql === undefined ? getDb() : options.sql;
  if (!sql) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 3, 10));

  try {
    // Pre-BM25 best-effort retrieval: skill-scoped documents whose content mentions
    // one of the weak-metric ids/keywords. Safe and empty-corpus tolerant.
    const patterns = metricIds.slice(0, 5).map(k => `%${k}%`);
    const rows = patterns.length
      ? await sql<{ id: string; title: string; content: string }[]>`
          select id::text, title, content
          from skill_documents
          where skill_id = ${skillId}
            and content ilike any (${patterns})
          limit ${limit}
        `
      : await sql<{ id: string; title: string; content: string }[]>`
          select id::text, title, content
          from skill_documents
          where skill_id = ${skillId}
          limit ${limit}
        `;
    return rows.map(r => ({ id: r.id, title: r.title, content: r.content }));
  } catch {
    return [];
  }
}
