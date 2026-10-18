// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { searchCoachingDocuments } from "@/lib/db/search";

describe("searchCoachingDocuments (BM25)", () => {
  it("returns [] when Tiger is unconfigured", async () => {
    expect(await searchCoachingDocuments("needle-passing", "jerky motion", { sql: null })).toEqual([]);
  });

  it("returns [] without throwing when the query rejects", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect(await searchCoachingDocuments("needle-passing", "jerky motion", { sql: sql as never })).toEqual([]);
  });

  it("returns [] for a blank query without touching the database", async () => {
    const sql = vi.fn(async () => {
      throw new Error("should not be called");
    });
    expect(await searchCoachingDocuments("needle-passing", "   ", { sql: sql as never })).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });

  it("runs a skill-scoped BM25 ranking and maps the documents", async () => {
    const seen: unknown[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      seen.push(...values);
      // BM25 operator + query builder, matches-only, best-first ordering.
      expect(text).toContain("to_bm25query");
      expect(text).toContain("<@>");
      expect(text).toContain("< 0");
      expect(text.toLowerCase()).toContain("order by");
      return [
        { id: "doc-1", title: "Smoothing jerky needle motion", content: "Move in one arc." },
      ];
    });
    const docs = await searchCoachingDocuments("needle-passing", "movement smoothness jerky", {
      sql: sql as never,
    });
    expect(docs).toEqual([
      { id: "doc-1", title: "Smoothing jerky needle motion", content: "Move in one arc." },
    ]);
    // skill id and the query text are passed as parameters, not interpolated.
    expect(seen).toContain("needle-passing");
    expect(seen).toContain("movement smoothness jerky");
  });
});
