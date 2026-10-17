import { expect, test, type Page } from "@playwright/test";
import { calibrate, fakeHands, setHands, type FixtureWindow } from "../fixtures/browser-controls";

test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});
test.setTimeout(60_000);

async function instrument(page: Page, side: "left" | "right") {
  const text = await page.getByTestId(`${side}-instrument-state`).innerText();
  return JSON.parse(text.slice(text.indexOf(":") + 1)) as {
    sourceTMs: number | null;
    tool: {
      position: { x: number };
      tipPosition: { x: number; y: number; z: number };
      jawClosed: boolean;
    } | null;
    rendered: { position: { x: number } } | null;
  };
}

async function guideLeftTip(
  page: Page,
  targetX: number,
  targetY: number,
  pose: { x: number; y: number },
  options: { ratio?: number; rotationZ?: number } = {},
) {
  let { x, y } = pose;
  let lastSource: number | null = null;
  await setHands(page, { x, y, ...options });
  await expect
    .poll(
      async () => {
        const observed = await instrument(page, "left");
        if (!observed.tool || observed.sourceTMs === lastSource) return Infinity;
        lastSource = observed.sourceTMs;
        const errX = observed.tool.tipPosition.x - targetX;
        const errY = observed.tool.tipPosition.y - targetY;
        const dist = Math.hypot(errX, errY);
        if (dist >= 0.045) {
          x += errX * 0.025;
          y += errY * 0.035;
          await setHands(page, { x, y, ...options });
        }
        return dist;
      },
      { timeout: 12_000, intervals: [250] },
    )
    .toBeLessThan(0.045);
  return { x, y };
}

async function completeNeedlePass(page: Page) {
  // Complete all 8 segments
  let pose = await guideLeftTip(page, 0, 0.35, { x: 0.7, y: 0.5 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: grip");

  await setHands(page, { ...pose, ratio: 0.1 });
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");

  pose = await guideLeftTip(page, -0.16, 0.24, pose, { ratio: 0.1 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: entry");

  pose = await guideLeftTip(page, 0, 0.18, pose, { ratio: 0.1, rotationZ: -0.35 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: rotation");

  pose = await guideLeftTip(page, 0.16, 0.24, pose, { ratio: 0.1, rotationZ: -0.35 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: exit");

  pose = await guideLeftTip(page, 0.2, 0.36, pose, { ratio: 0.1, rotationZ: 0 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: release");

  await setHands(page, { ...pose, ratio: 0.9, rotationZ: 0 });
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete");
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();

}

test("fixture mode (?fixture=needle-pass-good and ?fixture=needle-pass-late-rotation) runs without webcam and renders deterministic 20-metric results", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fakeHands(page);

  await page.goto("/train/needle-passing?fixture=needle-pass-good&debug=1");
  await expect(page.getByRole("heading", { name: "Needle Passing" })).toBeVisible();
  await expect(page.getByTestId("fixture-banner")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Status: fixture (needle-pass-good)");

  // Exercise the real animated runtime, including the Learn demonstration.
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();

  const goodOverall = Number(await page.getByTestId("overall-score").innerText());
  expect(goodOverall).toBeGreaterThan(80);
  await expect(page.getByTestId("category-precision")).toBeVisible();
  await expect(page.getByTestId("category-control")).toBeVisible();
  await expect(page.getByTestId("category-technique")).toBeVisible();
  await expect(page.getByTestId("category-coordination")).toBeVisible();
  await expect(page.getByTestId("category-efficiencySafety")).toBeVisible();
  await expect(page.getByTestId("strongest-metric")).toBeVisible();
  await expect(page.getByTestId("weakest-metric")).toBeVisible();

  const goodResultJson = JSON.parse(
    await page.getByTestId("evaluation-result-json").innerText(),
  ) as {
    overallScore: number;
    performance: {
      instrumentOrientationAccuracy: number;
      rotationControlAccuracy: number;
      dangerZoneAvoidance: number;
      proceduralSequencing: number;
    };
  };
  expect(goodResultJson.performance.dangerZoneAvoidance).toBe(100);
  expect(goodResultJson.performance.proceduralSequencing).toBe(100);

  await page.getByTestId("attempt-results-panel").screenshot({ path: "test-results/s1-results-panel.png" });
  await page.getByLabel("3D instrument workspace").screenshot({ path: "test-results/s1-workspace.png" });

  // Switch to needle-pass-late-rotation fixture and verify score drops deterministically
  await page.getByTestId("fixture-select").selectOption("needle-pass-late-rotation");
  await expect(page.getByRole("status")).toContainText(
    "Status: fixture (needle-pass-late-rotation)",
  );
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();

  const lateOverall = Number(await page.getByTestId("overall-score").innerText());
  expect(lateOverall).toBeLessThan(goodOverall);

  const lateResultJson = JSON.parse(
    await page.getByTestId("evaluation-result-json").innerText(),
  ) as {
    overallScore: number;
    performance: {
      instrumentOrientationAccuracy: number;
      rotationControlAccuracy: number;
    };
    worstMoments: unknown[];
  };
  expect(lateResultJson.performance.instrumentOrientationAccuracy).toBeLessThan(
    goodResultJson.performance.instrumentOrientationAccuracy,
  );
  expect(lateResultJson.performance.rotationControlAccuracy).toBeLessThan(
    goodResultJson.performance.rotationControlAccuracy,
  );
  expect(lateResultJson.worstMoments.length).toBeGreaterThan(0);

  // Try again clears results and restarts the exercise cleanly
  await page.getByTestId("try-again-button").click();
  await expect(page.getByTestId("attempt-results-panel")).toHaveCount(0);
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  await expect(page.getByTestId("attempt-save-status")).toContainText("excluded from your saved attempt history");

  // No camera stream was requested during fixture mode
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).cameraRequests)).toBe(0);
  expect(errors).toEqual([]);
});

test("navigates from /library to /train/needle-passing, calibrates, shows ghost demo, completes attempt, and produces AttemptResult", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fakeHands(page);
  const uploads: string[] = [];
  let reviewCalls = 0;
  let reviewedScore = 0;
  const narration = "Compare the recorded movement at this measured difference with the guide.";
  await page.route("**/api/review", async route => {
    reviewCalls++;
    const body = route.request().postDataJSON();
    reviewedScore = body.overallScore;
    const top = [...body.worstMoments].sort((a, b) => b.severity - a.severity || a.tMs - b.tMs)[0];
    await route.fulfill({ json: {
      summary: "Measured movement reviewed.", strengths: [body.strongest.explanation], improvements: [body.weakest.explanation],
      largestDifference: { segmentId: top?.segmentId ?? "overall", explanation: body.weakest.explanation },
      replayNarration: narration,
    } });
  });
  await page.route("**/api/attempts", async route => {
    uploads.push(route.request().postDataJSON().attempt.id);
    await route.fulfill(uploads.length === 1
      ? { status: 503, json: { persistence: "local-only" } }
      : { json: { status: "duplicate", persistence: "duplicate" } });
  });

  // Verify coming-soon skill route stays intact
  await page.goto("/train/suturing");
  await expect(page.getByText("This skill is coming soon.")).toBeVisible();
  await page.getByRole("link", { name: "Back to library" }).click();
  await expect(page).toHaveURL(/\/library$/);

  // Navigate to Needle Passing from the library
  await page.getByRole("link", { name: "Train Needle Passing" }).click();
  await expect(page).toHaveURL(/\/train\/needle-passing$/);

  // Re-open with ?debug=1 so we can guide synthetic hands accurately via instrument state
  await page.goto("/train/needle-passing?debug=1");
  await expect(page.getByTestId("simulation-status")).toHaveText("Calibrate both hands to begin.");

  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await calibrate(page);
  await expect(page.getByTestId("simulation-status")).toHaveText("Simulation ready");

  // Default mode on /train/needle-passing is Learn mode -> verify ghost demo
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: demonstration");
  await expect(page.getByTestId("exercise-ghost-status")).toHaveText("Ghost: visible");
  await page.getByTestId("start-attempt").click();
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: active");

  // A long preparation period stays recorded, but initial replay skips to a
  // three-second lead-in before the actual pickup. Observe the recording clock.
  await expect.poll(async () => JSON.parse(await page.getByTestId("exercise-state").innerText()).elapsedActiveMs,
    { timeout: 10_000 }).toBeGreaterThanOrEqual(5000);
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: free");

  await completeNeedlePass(page);

  const scoreValue = Number(await page.getByTestId("overall-score").innerText());
  expect(scoreValue).toBeGreaterThan(0);
  expect(scoreValue).toBeLessThanOrEqual(100);

  const completed = JSON.parse(await page.getByTestId("evaluation-result-json").innerText()) as { id: string };
  await expect(page.getByTestId("ai-review-source")).toHaveText("Model explanation");
  await expect(page.getByTestId("ai-review-summary")).toHaveText("Measured movement reviewed.");
  expect(Number(await page.getByTestId("overall-score").innerText())).toBe(reviewedScore);
  expect(reviewCalls).toBe(1);
  await page.getByTestId("retry-cloud-sync").click();
  await expect(page.getByTestId("attempt-save-status")).toContainText("synced");
  expect(uploads).toEqual([completed.id, completed.id]);
  await expect(page.getByTestId("attempt-save-status")).toContainText("Saved on this device");
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();
  await expect.poll(async () => {
    const result = JSON.parse(await page.getByTestId("evaluation-result-json").innerText()) as { id: string };
    return result.id;
  }).toBe(completed.id);
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("steady-attempts", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const values = await new Promise<Array<{ result: { id: string } }>>((resolve, reject) => {
      const request = db.transaction("attempts").objectStore("attempts").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close(); return values.map(item => item.result.id);
  });
  expect(persisted).toEqual([completed.id]);
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await expect(page.getByTestId("replay-explanation")).toBeVisible();
  await expect(page.getByTestId("replay-explanation")).toHaveText(narration);
  const initialReplay = JSON.parse(await page.getByTestId("replay-state").innerText());
  if (!initialReplay.divergenceEmphasis) {
    expect(initialReplay.timeMs).toBeGreaterThanOrEqual(2000);
    expect(initialReplay.needle.heldBy).toBeNull();
  }
  await page.getByLabel("Replay timeline").focus(); await page.keyboard.press("Home");
  await expect.poll(async () => JSON.parse(await page.getByTestId("replay-state").innerText()).timeMs).toBe(0);
  await page.getByTestId("replay-play").click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("replay-state").innerText()).timeMs).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).cameraRequests)).toBe(1);
  await page.getByRole("button", { name: "Back to training" }).click();
  // Reload verifies persistence independently of the runtime's module memory.
  await page.reload();
  const storedId = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("steady-attempts", 1); request.onsuccess = () => resolve(request.result); });
    const values = await new Promise<Array<{ result: { id: string } }>>(resolve => { const request = db.transaction("attempts").objectStore("attempts").getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return values[0]?.result.id;
  });
  expect(storedId).toBe(completed.id);
  expect(errors).toEqual([]);
});

test("S1 recovers from denied camera access using fixtures, switches modes and returns to webcam", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await fakeHands(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let deny = true;
    navigator.mediaDevices.getUserMedia = constraints => {
      if (deny) { deny = false; return Promise.reject(new DOMException("denied", "NotAllowedError")); }
      return original(constraints);
    };
  });
  await page.goto("/train/needle-passing");
  await expect(page.getByTestId("evaluation-result-json")).toHaveCount(0);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("permission was denied");
  await page.getByTestId("toggle-fixture-mode").click();
  await page.getByRole("button", { name: /^Assessment/ }).click();
  await expect(page.getByTestId("exercise-ghost-status")).toHaveText("Ghost: disabled in assessment");
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  await expect(page.getByTestId("live-coaching")).toHaveCount(0);
  await expect(page.getByTestId("attempt-save-status")).toContainText("Demonstration results");
  await page.getByRole("button", { name: /^Practice/ }).click();
  await expect(page.getByTestId("attempt-results-panel")).toHaveCount(0);
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  await page.getByTestId("toggle-fixture-mode").click();
  await expect(page.getByTestId("fixture-banner")).toHaveCount(0);
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: idle");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await expect(page.getByTestId("calibration-status")).not.toContainText("ready");
  await page.evaluate(() => {
    const video = document.querySelector("video")!;
    const tracks = (video.srcObject as MediaStream).getTracks();
    Object.assign(window, { s1Tracks: tracks });
  });
  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as Window & { s1Tracks: MediaStreamTrack[] }).s1Tracks.every(track => track.readyState === "ended"))).toBe(true);
  expect(errors).toEqual([]);
});

test("S1 fixture pauses through WebGL loss and restarts cleanly after restoration", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/train/needle-passing?fixture=needle-pass-good&debug=1");
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: demonstration");
  await page.getByLabel("3D instrument workspace").locator("canvas").evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    Object.assign(window, { s1GlLoss: extension }); extension.loseContext();
  });
  await expect(page.getByTestId("simulation-status")).toContainText("context lost");
  const paused = JSON.parse(await page.getByTestId("exercise-state").innerText()) as { frameCount: number };
  await page.getByTestId("ghost-speed-0.5x").click();
  expect((JSON.parse(await page.getByTestId("exercise-state").innerText()) as { frameCount: number }).frameCount).toBe(paused.frameCount);
  await page.evaluate(() => (window as unknown as Window & { s1GlLoss: WEBGL_lose_context }).s1GlLoss.restoreContext());
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 15_000 });
  expect(errors).toEqual([]);
});


test("S1 produces results offline when device storage is unavailable", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await fakeHands(page);
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined }));
  await page.goto("/train/needle-passing?debug=1");
  await page.getByRole("button", { name: /^Practice/ }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await page.getByTestId("quick-single-hand-start").click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: ready");
  await expect(page.getByTestId("simulation-status")).toHaveText("Simulation ready");
  await context.setOffline(true);
  try {
    await completeNeedlePass(page);
    await expect(page.getByTestId("attempt-save-status")).toContainText("Available until you reload");
    const result = JSON.parse(await page.getByTestId("evaluation-result-json").innerText()) as { performance: Record<string, number> };
    expect(Object.keys(result.performance)).toHaveLength(20);
    await page.getByRole("button", { name: "Stop camera" }).click();
    await expect(page.getByTestId("attempt-results-panel")).toBeVisible();
    await page.getByTestId("open-attempt-replay").click();
    await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
    await expect(page.getByTestId("replay-explanation")).toBeVisible();
    await page.getByLabel("Replay timeline").focus();
    await page.keyboard.press("Home");
    await page.getByTestId("replay-play").click();
    await expect.poll(async () => JSON.parse(await page.getByTestId("replay-state").innerText()).timeMs).toBeGreaterThan(0);
  } finally { await context.setOffline(false); }
  expect(errors).toEqual([]);
});
