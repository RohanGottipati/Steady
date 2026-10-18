// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { retrieveCoachingContext } from "@/lib/ai/coaching-retrieval";

describe("retrieveCoachingContext (B12 BM25 upgrade)", () => {
  it("expands camelCase metric ids into BM25 search terms", async () => {
    const seen: unknown[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      seen.push(...values);
      // Now retrieves through the BM25 index, not a plain ILIKE scan.
      expect(text).toContain("to_bm25query");
      expect(text).not.toContain("ilike");
      return [{ id: "d1", title: "Smoothing jerky needle motion", content: "..." }];
    });
    const docs = await retrieveCoachingContext(
      "needle-passing",
      ["movementSmoothness", "dangerZoneAvoidance"],
      { sql: sql as never },
    );
    expect(docs).toEqual([{ id: "d1", title: "Smoothing jerky needle motion", content: "..." }]);
    const query = seen.find(v => typeof v === "string" && v.includes("smoothness")) as string;
    expect(query).toContain("movement smoothness");
    expect(query).toContain("danger zone avoidance");
  });

  it("returns [] when no metric ids are supplied (no query)", async () => {
    const sql = vi.fn(async () => {
      throw new Error("should not be called");
    });
    expect(await retrieveCoachingContext("needle-passing", [], { sql: sql as never })).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});
