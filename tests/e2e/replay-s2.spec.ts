import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(60_000);

test("S2 focuses the recorded difference, shows the explanation, and stays usable when speech fails", async ({ page }) => {
  const errors: string[] = [];
  const live: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/api\/(speech|attempts|review)|elevenlabs|backboard/i.test(request.url())) live.push(request.url());
  });
  await page.addInitScript(() => {
    (window as unknown as { cameraCalls: number }).cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { cameraCalls: number }).cameraCalls++;
      throw new Error("The replay must not request a camera.");
    };
    const fail = (utterance: { onerror?: () => void }) => utterance.onerror?.();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: fail, cancel() {}, getVoices: () => [] },
    });
  });
  await page.route("**/api/speech", route => route.fulfill({ status: 503, contentType: "text/plain", body: "disabled" }));
  await page.goto("/train/needle-passing?fixture=needle-pass-late-rotation&debug=1");
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  const explanation = page.getByTestId("replay-explanation");
  await expect(explanation).toBeVisible();
  await expect(explanation).not.toHaveText("No difference marker was recorded for this attempt.");
  const state = async () => JSON.parse(await page.getByTestId("replay-state").innerText()) as {
    playing: boolean; divergenceEmphasis: boolean; segmentId: string | null; timeMs: number;
  };
  await expect.poll(async () => (await state()).divergenceEmphasis, { timeout: 30_000 }).toBe(true);
  const focused = await state();
  expect(focused.playing).toBe(false);
  expect(focused.segmentId).toBeTruthy();
  await expect(page.getByTestId("replay-focus")).toHaveText("Paused at the largest recorded difference.");
  await expect(explanation).toContainText(/largest|severity/i);
  await page.getByTestId("replay-skip-narration").click();
  await expect(explanation).toBeVisible();
  await page.getByTestId("replay-play").click();
  await expect.poll(async () => {
    const next = await state();
    return next.playing || next.timeMs !== focused.timeMs;
  }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { cameraCalls: number }).cameraCalls)).toBe(0);
  expect(errors).toEqual([]);
  expect(live).toEqual([]);
});
