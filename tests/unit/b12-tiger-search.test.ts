// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, getDatabaseUrl } from "../../scripts/tiger/db.mjs";
import { migrate } from "../../scripts/tiger/migrate.mjs";
import { seed } from "../../scripts/tiger/seed.mjs";
import { findSimilarAttempts } from "@/lib/db/similarity";
import { searchCoachingDocuments } from "@/lib/db/search";
import { retrieveCoachingContext } from "@/lib/ai/coaching-retrieval";
import { getAttemptDeviationStats, getDownsampledDeviation } from "@/lib/db/analytics";

// B12 acceptance (plan §B12) against a live Tiger service. The DiskANN/BM25
// indexes, coaching corpus, and synthetic analytics telemetry come from the
// 0003 migration + seeds. Requires STEADY_TIGER_INTEGRATION=1 and a reachable
// service; the default offline suite skips it. Synthetic fixtures below live
// under a dedicated anonymous user seeded by db/seeds/0003_analytics_demo.sql.
const url = process.env.STEADY_TIGER_INTEGRATION === "1" ? getDatabaseUrl() : "";
const describeDb = url ? describe : describe.skip;

const A = "00000000-0000-7000-8000-00000000b001"; // most recent synthetic attempt
const B = "00000000-0000-7000-8000-00000000b002"; // nearly identical profile

describeDb("B12 Tiger search / similarity / analytics", () => {
  let sql: ReturnType<typeof connect>;

  beforeAll(async () => {
    sql = connect(url as string);
    await migrate(sql);
    await seed(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  it("retrieves nearest prior attempts within the same skill (DiskANN)", async () => {
    const similar = await findSimilarAttempts(A, { sql, limit: 10 });
    expect(similar).not.toBeNull();
    const ids = similar!.map(s => s.attemptId);
    expect(ids[0]).toBe(B); // closest profile ranks first
    expect(ids).not.toContain(A); // query attempt excluded
    expect(similar!.every(s => s.skillId === "needle-passing")).toBe(true);
    // distances are non-decreasing (nearest-first ordering)
    const d = similar!.map(s => s.distance);
    expect([...d].sort((x, y) => x - y)).toEqual(d);
  });

  it("retrieves the expected coaching document for a known BM25 query", async () => {
    const smooth = await searchCoachingDocuments(
      "needle-passing",
      "movement smoothness jerky trembling",
      { sql, limit: 3 },
    );
    expect(smooth[0]?.title).toBe("Smoothing jerky needle motion");

    const danger = await searchCoachingDocuments(
      "needle-passing",
      "danger zone collision safety",
      { sql, limit: 3 },
    );
    expect(danger[0]?.title).toBe("Avoiding danger zones and collisions");
  });

  it("grounds the review via BM25 from weak-metric ids without touching scores", async () => {
    const docs = await retrieveCoachingContext("needle-passing", ["movementSmoothness"], { sql });
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].title).toBe("Smoothing jerky needle motion");
  });

  it("computes p95 and time-weighted deviation with hyperfunctions", async () => {
    const stats = await getAttemptDeviationStats(A, { sql });
    expect(stats).not.toBeNull();
    expect(stats!.sampleCount).toBe(240);
    expect(stats!.p95).toBeGreaterThanOrEqual(stats!.p50);
    expect(stats!.max).toBeGreaterThan(stats!.p95);
    expect(stats!.timeWeightedAvg).toBeGreaterThan(0);
  });

  it("downsamples to far fewer points while preserving the peak (LTTB)", async () => {
    const series = await getDownsampledDeviation(A, { sql, points: 20 });
    expect(series).not.toBeNull();
    expect(series!.length).toBeLessThanOrEqual(20);
    expect(series!.length).toBeLessThan(240 / 4); // substantially fewer than raw
    const peak = Math.max(...series!.map(p => p.value));
    expect(peak).toBeGreaterThan(3.0); // the ~3.3 spike survives downsampling
  });
});
