// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  deleteUserHistory,
  getUserProgress,
  getUserProgressOverview,
} from "@/lib/db/progress-queries";

const ANON = "00000000-0000-7000-8000-00000000abcd";

describe("getUserProgress", () => {
  it("returns null when Tiger is unconfigured", async () => {
    expect(await getUserProgress(ANON, { sql: null })).toBeNull();
  });

  it("returns null without throwing when the query rejects", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect(await getUserProgress(ANON, { sql: sql as never })).toBeNull();
  });

  it("aggregates from attempt_scores (never raw motion/metric samples)", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      expect(text).toContain("attempt_scores");
      expect(text).not.toContain("motion_samples");
      expect(text).not.toContain("metric_samples");
      return [
        {
          skill_id: "needle-passing",
          attempts: 2,
          best_score: 88,
          avg_score: 80.4,
          latest_score: 84,
          latest_at: "2026-10-17T12:00:00.000Z",
          avg_precision: 81,
          avg_control: 79,
          avg_technique: 82,
          avg_coordination: 78,
          avg_efficiency_safety: 80,
        },
      ];
    });
    const progress = await getUserProgress(ANON, { sql: sql as never });
    expect(progress).toEqual([
      {
        skillId: "needle-passing",
        trend: [],
        attempts: 2,
        bestScore: 88,
        avgScore: 80,
        latestScore: 84,
        latestAt: "2026-10-17T12:00:00.000Z",
        avgCategoryScores: {
          precision: 81,
          control: 79,
          technique: 82,
          coordination: 78,
          efficiencySafety: 80,
        },
      },
    ]);
  });
});

describe("deleteUserHistory", () => {
  it("returns unconfigured when no SQL client is available", async () => {
    expect(await deleteUserHistory(ANON, { sql: null })).toBe("unconfigured");
  });

  it("returns failed without throwing when the transaction rejects", async () => {
    const sql = Object.assign(() => undefined, {
      begin: async () => {
        throw new Error("connection refused");
      },
    });
    expect(await deleteUserHistory(ANON, { sql: sql as never })).toBe("failed");
  });

  it("deletes per-user telemetry and scores in one transaction", async () => {
    const queries: string[] = [];
    const makeTx = (ids: string[]) =>
      ((first: unknown) => {
        if (Array.isArray(first) && "raw" in first) {
          const text = (first as TemplateStringsArray).join(" ");
          queries.push(text);
          if (text.includes("select id from attempts")) {
            return Promise.resolve(ids.map((id) => ({ id })));
          }
          return Promise.resolve([]);
        }
        // helper form: tx(attemptIds) embedded as an `in (...)` fragment
        return first;
      }) as never;

    const sql = Object.assign(() => undefined, {
      begin: async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(makeTx(["11111111-1111-4111-8111-111111111111"])),
    });

    expect(await deleteUserHistory(ANON, { sql: sql as never })).toBe("synced");
    const joined = queries.join("\n");
    expect(joined).toContain("delete from attempt_scores");
    expect(joined).toContain("delete from attempts");
    expect(joined).toContain("delete from motion_samples");
    expect(joined).toContain("delete from coaching_events");
  });

  it("skips the child-table deletes when the user has no attempts", async () => {
    const queries: string[] = [];
    const makeTx = () =>
      ((first: unknown) => {
        if (Array.isArray(first) && "raw" in first) {
          const text = (first as TemplateStringsArray).join(" ");
          queries.push(text);
          return Promise.resolve([]); // no attempt ids
        }
        return first;
      }) as never;

    const sql = Object.assign(() => undefined, {
      begin: async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx()),
    });

    expect(await deleteUserHistory(ANON, { sql: sql as never })).toBe("synced");
    const joined = queries.join("\n");
    expect(joined).not.toContain("delete from motion_samples");
    expect(joined).toContain("delete from attempt_scores");
  });
});

describe("progress overview", () => {
  it("returns an empty summary without inventing scores", async () => {
    expect(
      await getUserProgressOverview(ANON, {
        sql: vi.fn(async () => []) as never,
      }),
    ).toEqual({
      progress: [],
      summary: { attempts: 0, bestScore: null, avgScore: null },
    });
  });
  it("uses exact global aggregates and returns chronological bounded score points", async () => {
    const trend = [
      { attemptId: "a", completedAt: "2026-10-17T00:00:00Z", overallScore: 0 },
      { attemptId: "b", completedAt: "2026-10-18T00:00:00Z", overallScore: 80 },
    ];
    const sql = vi.fn(async (strings: TemplateStringsArray, user: string) => {
      expect(user).toBe(ANON);
      const query = strings.join("?");
      expect(query).toContain("where anonymous_user_id =");
      expect(query).toContain("filter (where rn <= 20)");
      expect(query).toContain("order by completed_at asc, attempt_id asc");
      expect(query).not.toContain("motion_samples");
      return [
        {
          skill_id: "needle-passing",
          attempts: 21,
          best_score: 88,
          avg_score: 50.4,
          latest_score: 80,
          latest_at: "2026-10-18T00:00:00Z",
          avg_precision: 0,
          avg_control: 10,
          avg_technique: 20,
          avg_coordination: 30,
          avg_efficiency_safety: 40,
          trend,
          total_attempts: 30,
          total_best_score: 99,
          total_avg_score: 60.49,
        },
      ];
    });
    const data = await getUserProgressOverview(ANON, { sql: sql as never });
    expect(data?.summary).toEqual({
      attempts: 30,
      bestScore: 99,
      avgScore: 60,
    });
    expect(data?.progress[0].trend).toEqual(trend);
    expect(data?.progress[0].avgCategoryScores.precision).toBe(0);
  });
});
