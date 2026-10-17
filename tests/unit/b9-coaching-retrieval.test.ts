import { describe, expect, it, vi } from "vitest";
import { retrieveCoachingContext } from "@/lib/ai/coaching-retrieval";
import type postgres from "postgres";

type SqlLike = ReturnType<typeof postgres>;

/** A tagged-template stub standing in for the postgres client. */
function stubSql(rows: unknown[]): SqlLike {
  return vi.fn(async () => rows) as unknown as SqlLike;
}

describe("retrieveCoachingContext (B9 Tiger hook)", () => {
  it("maps skill_documents rows into coaching documents", async () => {
    const sql = stubSql([
      { id: "doc-1", title: "Corridor control", content: "Keep the tip inside the corridor." },
    ]);
    const docs = await retrieveCoachingContext("needle-passing", ["pathDeviation"], { sql });
    expect(docs).toEqual([
      { id: "doc-1", title: "Corridor control", content: "Keep the tip inside the corridor." },
    ]);
  });

  it("returns [] when Tiger is unconfigured (null client)", async () => {
    expect(await retrieveCoachingContext("needle-passing", ["x"], { sql: null })).toEqual([]);
  });

  it("degrades to [] when the query throws (never propagates)", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as SqlLike;
    expect(await retrieveCoachingContext("needle-passing", ["x"], { sql })).toEqual([]);
  });

  it("returns [] for an empty corpus", async () => {
    expect(await retrieveCoachingContext("needle-passing", [], { sql: stubSql([]) })).toEqual([]);
  });
});
