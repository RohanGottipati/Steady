// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { findSimilarAttempts } from "@/lib/db/similarity";

const ATTEMPT = "00000000-0000-7000-8000-00000000b001";

describe("findSimilarAttempts", () => {
  it("returns null when Tiger is unconfigured", async () => {
    expect(await findSimilarAttempts(ATTEMPT, { sql: null })).toBeNull();
  });

  it("returns null without throwing when the query rejects", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect(await findSimilarAttempts(ATTEMPT, { sql: sql as never })).toBeNull();
  });

  it("ranks prior same-skill attempts by cosine distance, excluding the query attempt", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      // DiskANN cosine operator over the score vectors, scoped and prior-only.
      expect(text).toContain("attempt_scores");
      expect(text).toContain("<=>");
      expect(text).toContain("s.skill_id = q.skill_id");
      expect(text).toContain("s.attempt_id <>");
      expect(text).toContain("s.completed_at < q.completed_at");
      return [
        {
          attempt_id: "00000000-0000-7000-8000-00000000b002",
          skill_id: "needle-passing",
          overall_score: 78,
          completed_at: "2026-10-15T12:02:00.000Z",
          distance: 0,
        },
        {
          attempt_id: "00000000-0000-7000-8000-00000000b003",
          skill_id: "needle-passing",
          overall_score: 74,
          completed_at: "2026-10-14T12:02:00.000Z",
          distance: 0.00125,
        },
      ];
    });
    const result = await findSimilarAttempts(ATTEMPT, { sql: sql as never, limit: 5 });
    expect(result).toEqual([
      {
        attemptId: "00000000-0000-7000-8000-00000000b002",
        skillId: "needle-passing",
        overallScore: 78,
        completedAt: "2026-10-15T12:02:00.000Z",
        distance: 0,
      },
      {
        attemptId: "00000000-0000-7000-8000-00000000b003",
        skillId: "needle-passing",
        overallScore: 74,
        completedAt: "2026-10-14T12:02:00.000Z",
        distance: 0.00125,
      },
    ]);
  });
});
