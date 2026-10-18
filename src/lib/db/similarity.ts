import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";

type SqlLike = ReturnType<typeof postgres>;

/** A prior attempt whose performance profile is close to the query attempt. */
export interface SimilarAttempt {
  attemptId: string;
  skillId: string;
  overallScore: number;
  completedAt: string;
  /** Cosine distance (0 = identical direction); smaller is more similar. */
  distance: number;
}

export interface SimilarityDeps {
  /** Injectable SQL client for tests; defaults to the Tiger singleton. */
  sql?: SqlLike | null;
  /** Max neighbours to return. */
  limit?: number;
}

/**
 * B12 vector similarity (plan 18.5): find the prior attempts whose 20D
 * performance profile is nearest to the given attempt, within the same skill.
 * Uses the StreamingDiskANN cosine index (`attempt_scores_vector_idx`); cosine
 * distance means "similar simulator performance profile", not clinical
 * equivalence. Returns `null` when Tiger is unconfigured/unreachable so callers
 * can degrade gracefully; never throws.
 */
export async function findSimilarAttempts(
  attemptId: string,
  deps: SimilarityDeps = {},
): Promise<SimilarAttempt[] | null> {
  const sql = deps.sql === undefined ? getDb() : deps.sql;
  if (!sql) return null;
  const limit = Math.max(1, Math.min(deps.limit ?? 5, 20));

  try {
    const rows = await sql<
      {
        attempt_id: string;
        skill_id: string;
        overall_score: number;
        completed_at: string | Date;
        distance: number;
      }[]
    >`
      with q as (
        select performance_vector as v, skill_id, completed_at
        from attempt_scores
        where attempt_id = ${attemptId}
        limit 1
      )
      select s.attempt_id::text as attempt_id,
             s.skill_id,
             s.overall_score,
             s.completed_at,
             (s.performance_vector <=> q.v) as distance
      from attempt_scores s, q
      where s.skill_id = q.skill_id
        and s.attempt_id <> ${attemptId}
        and s.completed_at < q.completed_at
      order by s.performance_vector <=> q.v
      limit ${limit}
    `;
    return rows.map(r => ({
      attemptId: r.attempt_id,
      skillId: r.skill_id,
      overallScore: Math.round(r.overall_score),
      completedAt:
        typeof r.completed_at === "string" ? r.completed_at : new Date(r.completed_at).toISOString(),
      distance: Number(r.distance),
    }));
  } catch {
    return null;
  }
}
