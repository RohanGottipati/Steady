// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, getDatabaseUrl } from "../../scripts/tiger/db.mjs";
import { migrate } from "../../scripts/tiger/migrate.mjs";
import { seed } from "../../scripts/tiger/seed.mjs";

// B0 acceptance (plan 26): migrations apply, core tables + hypertables exist,
// and one synthetic attempt can be inserted and queried back.
// Requires explicit STEADY_TIGER_INTEGRATION=1 and an isolated reachable service.
// The default offline suite never applies migrations or seeds to a live database.
const url = process.env.STEADY_TIGER_INTEGRATION === "1" ? getDatabaseUrl() : "";
const describeDb = url ? describe : describe.skip;

describeDb("B0 Tiger Data bootstrap", () => {
  let sql: ReturnType<typeof connect>;

  beforeAll(async () => {
    sql = connect(url as string);
    await migrate(sql);
    await seed(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  it("creates the core relational and time-series tables", async () => {
    const rows = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
    `;
    const names = rows.map((r) => r.table_name as string);
    for (const t of [
      "anonymous_users",
      "skills",
      "attempts",
      "reference_motions",
      "coach_reviews",
      "skill_documents",
      "motion_samples",
      "metric_samples",
      "attempt_scores",
      "coaching_events",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("registers the time-series tables as hypertables", async () => {
    const rows = await sql`
      select hypertable_name from timescaledb_information.hypertables
    `;
    const names = rows.map((r) => r.hypertable_name as string);
    for (const t of ["motion_samples", "metric_samples", "attempt_scores", "coaching_events"]) {
      expect(names).toContain(t);
    }
  });

  it("stores a 20-dimensional performance vector column", async () => {
    const rows = await sql`
      select a.atttypmod as dim
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      where c.relname = 'attempt_scores' and a.attname = 'performance_vector'
    `;
    expect(rows[0]?.dim).toBe(20);
  });

  it("seeds one skill and one synthetic attempt that can be queried back", async () => {
    const skills = await sql`select id from skills where id = 'needle-passing'`;
    expect(skills.length).toBe(1);

    const attempts = await sql`
      select a.id, a.overall_score
      from attempts a
      join skills s on s.id = a.skill_id
      where a.skill_id = 'needle-passing'
    `;
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(Number(attempts[0].overall_score)).toBeGreaterThan(0);

    const scores = await sql`select performance_vector from attempt_scores limit 1`;
    expect(scores.length).toBeGreaterThanOrEqual(1);
  });
});
