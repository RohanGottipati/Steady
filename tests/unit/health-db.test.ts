// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, getDatabaseUrl } from "../../scripts/tiger/db.mjs";
import { databaseStatus } from "@/lib/db/health";

describe("databaseStatus", () => {
  it("returns 'unconfigured' when there is no client", async () => {
    expect(await databaseStatus(null)).toBe("unconfigured");
  });

  it("returns 'down' when a query rejects, without throwing", async () => {
    // Minimal failing stub standing in for an unreachable database.
    const failing = (() => Promise.reject(new Error("connection refused"))) as never;
    expect(await databaseStatus(failing)).toBe("down");
  });

  const url = process.env.STEADY_TIGER_INTEGRATION === "1" ? getDatabaseUrl() : "";
  const itDb = url ? it : it.skip;
  let sql: ReturnType<typeof connect> | undefined;
  beforeAll(() => {
    if (url) sql = connect(url as string);
  });
  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  itDb("returns 'up' against a reachable Tiger service", async () => {
    expect(await databaseStatus(sql!)).toBe("up");
  });
});

describe("/api/health route", () => {
  const url = process.env.STEADY_TIGER_INTEGRATION === "1" ? getDatabaseUrl() : "";
  beforeAll(() => {
    if (url) process.env.TIGER_DATABASE_URL = url as string;
  });

  const itDb = url ? it : it.skip;
  itDb("reports service ok and db up when Tiger is reachable", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("steady");
    expect(body.db).toBe("up");
  });
});
