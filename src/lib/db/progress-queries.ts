import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";

type SqlLike = ReturnType<typeof postgres>;

export type HistoryStatus = "synced" | "unconfigured" | "failed";

export interface ProgressDeps {
  /** Injectable SQL client for tests; defaults to the Tiger singleton. */
  sql?: SqlLike | null;
}

function resolveSql(deps: ProgressDeps): SqlLike | null {
  return deps.sql === undefined ? getDb() : deps.sql;
}

export interface SkillProgress {
  skillId: string;
  attempts: number;
  bestScore: number;
  avgScore: number;
  latestScore: number;
  latestAt: string;
  avgCategoryScores: {
    precision: number;
    control: number;
    technique: number;
    coordination: number;
    efficiencySafety: number;
  };
}

/**
 * Read per-skill progress for an anonymous user from the compact `attempt_scores`
 * rows (B10 acceptance: progress uses the score table, never raw motion samples).
 * The daily continuous aggregate (`user_skill_daily_progress`, 0002_progress) is
 * maintained for longer-horizon rollups; the live page reads `attempt_scores` so
 * a just-synced attempt appears before the next CAGG refresh. Returns `null` when
 * Tiger is unconfigured/unreachable so the page degrades to a local-only notice.
 */
export async function getUserProgress(
  anonymousUserId: string,
  deps: ProgressDeps = {},
): Promise<SkillProgress[] | null> {
  const sql = resolveSql(deps);
  if (!sql) return null;
  try {
    const rows = await sql<
      {
        skill_id: string;
        attempts: number;
        best_score: number;
        avg_score: number;
        latest_score: number;
        latest_at: string;
        avg_precision: number;
        avg_control: number;
        avg_technique: number;
        avg_coordination: number;
        avg_efficiency_safety: number;
      }[]
    >`
      with ranked as (
        select skill_id, overall_score, completed_at,
               precision_score, control_score, technique_score,
               coordination_score, efficiency_safety_score,
               row_number() over (partition by skill_id order by completed_at desc) as rn
        from attempt_scores
        where anonymous_user_id = ${anonymousUserId}
      )
      select skill_id,
             count(*)::int as attempts,
             max(overall_score) as best_score,
             avg(overall_score) as avg_score,
             max(overall_score) filter (where rn = 1) as latest_score,
             max(completed_at) filter (where rn = 1) as latest_at,
             avg(precision_score) as avg_precision,
             avg(control_score) as avg_control,
             avg(technique_score) as avg_technique,
             avg(coordination_score) as avg_coordination,
             avg(efficiency_safety_score) as avg_efficiency_safety
      from ranked
      group by skill_id
      order by max(completed_at) filter (where rn = 1) desc
    `;
    return rows.map(r => ({
      skillId: r.skill_id,
      attempts: r.attempts,
      bestScore: Math.round(r.best_score),
      avgScore: Math.round(r.avg_score),
      latestScore: Math.round(r.latest_score),
      latestAt: typeof r.latest_at === "string" ? r.latest_at : new Date(r.latest_at).toISOString(),
      avgCategoryScores: {
        precision: Math.round(r.avg_precision),
        control: Math.round(r.avg_control),
        technique: Math.round(r.avg_technique),
        coordination: Math.round(r.avg_coordination),
        efficiencySafety: Math.round(r.avg_efficiency_safety),
      },
    }));
  } catch {
    return null;
  }
}

/**
 * Delete all of an anonymous user's attempt history from Tiger (B10 acceptance:
 * "the current user can delete their anonymous attempt history"). The anonymous
 * user id is the device-scoped capability token — there is no account system, so
 * holding the id is what authorizes the delete. Returns a status instead of
 * throwing so the route can report failure and the client keeps local copies.
 */
export async function deleteUserHistory(
  anonymousUserId: string,
  deps: ProgressDeps = {},
): Promise<HistoryStatus> {
  const sql = resolveSql(deps);
  if (!sql) return "unconfigured";
  try {
    await sql.begin(async tx => {
      const ids = await tx<{ id: string }[]>`
        select id from attempts where anonymous_user_id = ${anonymousUserId}
      `;
      const attemptIds = ids.map(r => r.id);
      if (attemptIds.length) {
        await tx`delete from coaching_events where attempt_id in ${tx(attemptIds)}`;
        await tx`delete from metric_samples where attempt_id in ${tx(attemptIds)}`;
        await tx`delete from motion_samples where attempt_id in ${tx(attemptIds)}`;
        await tx`delete from coach_reviews where attempt_id in ${tx(attemptIds)}`;
      }
      await tx`delete from attempt_scores where anonymous_user_id = ${anonymousUserId}`;
      await tx`delete from attempts where anonymous_user_id = ${anonymousUserId}`;
    });
    return "synced";
  } catch {
    return "failed";
  }
}
