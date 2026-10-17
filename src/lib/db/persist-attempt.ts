import "server-only";

import { performanceVectorToArray } from "@/types/evaluation";
import type { AttemptUploadPayload } from "@/types/attempt";
import { getSkillDefinition } from "@/lib/skills/catalog";

export interface AttemptQuery {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<ReadonlyArray<{ id?: string }>>;
  json(value: unknown): unknown;
}

export interface AttemptDb extends AttemptQuery {
  begin<T>(callback: (tx: AttemptQuery) => Promise<T>): Promise<T>;
}

/**
 * Inserts one attempt header and its 20-number score vector.
 * A repeated id is a duplicate, not a second attempt. Motion-sample hypertables
 * stay with the later analytics work; this write is the offline-retry record.
 */
export async function persistUploadedAttempt(
  sql: AttemptDb,
  payload: AttemptUploadPayload,
): Promise<"synced" | "duplicate"> {
  const attempt = payload.attempt;
  const skill = getSkillDefinition(attempt.skillId);
  if (!skill) throw new Error("Unknown training skill.");
  const vector = `[${performanceVectorToArray(attempt.result.performance).join(",")}]`;
  const scores = attempt.result.categoryScores;
  return sql.begin(async tx => {
    // Server-owned metadata makes a newly enabled skill uploadable immediately.
    await tx`
      insert into skills (id, title, difficulty, description, source_label)
      values (${skill.id}, ${skill.title}, ${skill.difficulty}, ${skill.description}, ${skill.sourceLabel})
      on conflict (id) do nothing
    `;
    await tx`
      insert into anonymous_users (id)
      values (${attempt.anonymousUserId})
      on conflict (id) do nothing
    `;
    const inserted = await tx`
      insert into attempts (
        id, anonymous_user_id, skill_id, mode,
        started_at, completed_at, duration_ms, overall_score, result_json
      ) values (
        ${attempt.id},
        ${attempt.anonymousUserId},
        ${attempt.skillId},
        ${attempt.mode},
        ${attempt.startedAt},
        ${attempt.completedAt},
        ${Math.round(attempt.durationMs)},
        ${attempt.result.overallScore},
        ${tx.json(attempt.result)}
      )
      on conflict (id) do nothing
      returning id
    `;
    // ON CONFLICT waits for a concurrent transaction using the same id. Only
    // its winner writes scores; a retry cannot append another hypertable row.
    if (inserted.length === 0) return "duplicate";
    await tx`
      insert into attempt_scores (
        completed_at, attempt_id, anonymous_user_id, skill_id,
        overall_score, precision_score, control_score, technique_score,
        coordination_score, efficiency_safety_score, performance_vector
      )
      select
        ${attempt.completedAt},
        ${attempt.id},
        ${attempt.anonymousUserId},
        ${attempt.skillId},
        ${attempt.result.overallScore},
        ${scores.precision},
        ${scores.control},
        ${scores.technique},
        ${scores.coordination},
        ${scores.efficiencySafety},
        ${vector}::vector
      where not exists (
        select 1 from attempt_scores where attempt_id = ${attempt.id}
      )
    `;
    return "synced";
  });
}
