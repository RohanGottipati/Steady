// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getAttemptDeviationStats, getDownsampledDeviation } from "@/lib/db/analytics";

const ATTEMPT = "00000000-0000-7000-8000-00000000b001";
const USER = "00000000-0000-7000-8000-0000000000b1";

describe("getAttemptDeviationStats", () => {
  it("returns null when Tiger is unconfigured", async () => {
    expect(await getAttemptDeviationStats(ATTEMPT, USER, { sql: null })).toBeNull();
  });

  it("returns null without throwing when the query rejects", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect(await getAttemptDeviationStats(ATTEMPT, USER, { sql: sql as never })).toBeNull();
  });

  it("returns null when the attempt has no samples", async () => {
    const sql = vi.fn(async () => [{ p50: null, p95: null, max: null, time_weighted_avg: null, sample_count: 0 }]);
    expect(await getAttemptDeviationStats(ATTEMPT, USER, { sql: sql as never })).toBeNull();
  });

  it("computes percentile and time-weighted deviation with hyperfunctions, scoped to the owner", async () => {
    const seen: unknown[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      seen.push(...values);
      expect(text).toContain("approx_percentile");
      expect(text).toContain("percentile_agg");
      expect(text).toContain("time_weight");
      expect(text).toContain("metric_samples");
      // Ownership is enforced against the attempts table.
      expect(text).toContain("from attempts a");
      expect(text).toContain("a.anonymous_user_id =");
      return [{ p50: 0.416, p95: 0.549, max: 3.318, time_weighted_avg: 0.4292, sample_count: 240 }];
    });
    const stats = await getAttemptDeviationStats(ATTEMPT, USER, { sql: sql as never });
    expect(seen).toContain(USER);
    expect(stats).toEqual({
      p50: 0.416,
      p95: 0.549,
      max: 3.318,
      timeWeightedAvg: 0.4292,
      sampleCount: 240,
    });
  });
});

describe("getDownsampledDeviation", () => {
  it("returns null when Tiger is unconfigured", async () => {
    expect(await getDownsampledDeviation(ATTEMPT, USER, { sql: null })).toBeNull();
  });

  it("returns null without throwing when the query rejects", async () => {
    const sql = vi.fn(async () => {
      throw new Error("connection refused");
    });
    expect(await getDownsampledDeviation(ATTEMPT, USER, { sql: sql as never })).toBeNull();
  });

  it("downsamples the deviation series with LTTB, scoped to the owner", async () => {
    const seen: unknown[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      seen.push(...values);
      expect(text).toContain("lttb");
      expect(text).toContain("metric_samples");
      expect(text).toContain("from attempts a");
      expect(text).toContain("a.anonymous_user_id =");
      return [
        { t: "2026-10-16T12:00:00.000Z", v: 0.4 },
        { t: "2026-10-16T12:00:30.000Z", v: 3.318 },
        { t: "2026-10-16T12:02:00.000Z", v: 0.42 },
      ];
    });
    const series = await getDownsampledDeviation(ATTEMPT, USER, { sql: sql as never, points: 20 });
    expect(seen).toContain(USER);
    expect(series).toEqual([
      { t: "2026-10-16T12:00:00.000Z", value: 0.4 },
      { t: "2026-10-16T12:00:30.000Z", value: 3.318 },
      { t: "2026-10-16T12:02:00.000Z", value: 0.42 },
    ]);
  });
});
