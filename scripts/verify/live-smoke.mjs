import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

if (process.env.STEADY_LIVE_TEST !== "1")
  throw new Error(
    "Opt in with STEADY_LIVE_TEST=1. This creates and deletes only a fresh test user's attempts, and requests one review and one speech clip.",
  );
const base = new URL(
  process.env.STEADY_LIVE_BASE_URL ?? "http://localhost:3000",
);
const user = randomUUID();
const report = {
  startedAt: new Date().toISOString(),
  base: base.origin,
  testUser: user,
  checks: [],
  cleanup: "pending",
};
const keys = [
  "pathSimilarity",
  "targetAccuracy",
  "depthConsistency",
  "instrumentOrientationAccuracy",
  "movementSmoothness",
  "pathEfficiency",
  "motionStability",
  "overshootControl",
  "correctionEfficiency",
  "rotationControlAccuracy",
  "pinchStability",
  "gripTiming",
  "handWorkspaceControl",
  "bimanualCoordination",
  "segmentTiming",
  "speedProfileControl",
  "idleTimeControl",
  "toolCollisionAvoidance",
  "dangerZoneAvoidance",
  "proceduralSequencing",
];
const categories = (score) =>
  Object.fromEntries(
    [
      "precision",
      "control",
      "technique",
      "coordination",
      "efficiencySafety",
    ].map((key) => [key, score]),
  );
async function request(path, body, method = body ? "POST" : "GET") {
  return fetch(new URL(path, base), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
}
async function json(path, body, method) {
  const response = await request(path, body, method);
  assert.equal(
    response.status,
    200,
    `${path.split("?")[0]} returned ${response.status}`,
  );
  return response.json();
}
async function check(name, operation) {
  try {
    await operation();
    report.checks.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: "failed", error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
const endpoint = `/api/progress?anonymousUserId=${user}`;
try {
  await check(
    "upload, duplicate retry, real trends and ownership",
    async () => {
      assert.equal((await json(endpoint)).summary.attempts, 0);
      let last;
      for (const [skillIndex, skillId] of [
        "needle-passing",
        "peg-transfer",
      ].entries()) {
        for (const [index, score] of [60, 80].entries()) {
          const completedAt = new Date(
            Date.now() - 60_000 + skillIndex * 2000 + index * 1000,
          ).toISOString();
          const id = randomUUID();
          const result = {
            schemaVersion: 1,
            id,
            skillId,
            mode: "practice",
            createdAt: completedAt,
            durationMs: 12_000,
            referenceMotionId: "live-smoke-synthetic",
            performance: Object.fromEntries(keys.map((key) => [key, score])),
            categoryScores: categories(score),
            overallScore: score,
            importantEvents: [],
            worstMoments: [],
          };
          last = {
            attempt: {
              id,
              anonymousUserId: user,
              skillId,
              mode: "practice",
              startedAt: new Date(
                Date.parse(completedAt) - 12_000,
              ).toISOString(),
              completedAt,
              durationMs: 12_000,
              result,
            },
            motionSamples: [],
            metricSamples: [],
            coachingEvents: [],
          };
          const upload = await json("/api/attempts", last);
          assert.ok(
            ["synced", "duplicate"].includes(
              upload.status ?? upload.persistence,
            ),
          );
        }
      }
      const duplicate = await json("/api/attempts", last);
      assert.ok(
        ["synced", "duplicate"].includes(
          duplicate.status ?? duplicate.persistence,
        ),
      );
      const data = await json(endpoint);
      assert.deepEqual(data.summary, {
        attempts: 4,
        bestScore: 80,
        avgScore: 70,
      });
      for (const skill of data.progress) {
        assert.equal(skill.attempts, 2);
        assert.deepEqual(
          skill.trend.map((point) => point.overallScore),
          [60, 80],
        );
      }
      assert.equal(
        (await json(`/api/progress?anonymousUserId=${randomUUID()}`)).summary
          .attempts,
        0,
      );
    },
  );
  await check("actual Backboard review generation", async () => {
    const evidence = {
      id: "pathSimilarity",
      score: 70,
      explanation: "Synthetic smoke-test path similarity is 70 out of 100.",
    };
    const review = await json("/api/review", {
      skillId: "needle-passing",
      mode: "practice",
      overallScore: 70,
      categoryScores: categories(70),
      strongest: evidence,
      weakest: evidence,
      metrics: [{ id: "pathSimilarity", score: 70, rawValue: .3, explanation: evidence.explanation, segmentId: "rotation" }],
      worstMoments: [{ tMs: 1000, segmentId: "rotation", metricId: "pathSimilarity", severity: .3, explanationData: { score: 70 } }],
    });
    assert.equal(typeof review.summary, "string");
    assert.ok(review.summary.length > 0);
  });
  await check("actual ElevenLabs audio output", async () => {
    const response = await request("/api/speech", {
      text: "Steady live check. Review the reference path before your next attempt.",
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^audio\//);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 100);
    await mkdir("artifacts/acceptance", { recursive: true });
    await writeFile("artifacts/acceptance/live-speech.mp3", bytes);
  });
} finally {
  await check(
    "delete only the test user and verify empty history",
    async () => {
      await json(`/api/attempts?anonymousUserId=${user}`, undefined, "DELETE");
      const data = await json(endpoint);
      assert.equal(data.summary.attempts, 0);
      assert.deepEqual(data.progress, []);
      report.cleanup = "passed";
    },
  );
  report.finishedAt = new Date().toISOString();
  await mkdir("artifacts/acceptance", { recursive: true });
  await writeFile(
    "artifacts/acceptance/live-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Report: artifacts/acceptance/live-smoke.json");
  if (report.checks.some((check) => check.status === "failed"))
    process.exitCode = 1;
}
