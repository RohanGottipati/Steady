import type postgres from "postgres";

type SqlLike = ReturnType<typeof postgres>;

export type DatabaseStatus = "up" | "down" | "unconfigured";

// Reports Tiger Data reachability without ever throwing, so a database outage
// cannot break request handling (plan 3.4 rule 3). "unconfigured" means no
// TIGER_DATABASE_URL; "down" means a query failed.
export async function databaseStatus(sql: SqlLike | null): Promise<DatabaseStatus> {
  if (!sql) return "unconfigured";
  try {
    await sql`select 1`;
    return "up";
  } catch {
    return "down";
  }
}
