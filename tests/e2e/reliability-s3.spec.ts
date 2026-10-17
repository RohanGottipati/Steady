import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
test.setTimeout(60_000);

test("fixture mode recovers from offline and a failed reference load without live APIs", async ({ page, context }) => {
  const errors: string[] = [];
  const live: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = request.url();
    if (/\/api\/(speech|attempts|review)|elevenlabs|backboard/i.test(url)) live.push(url);
  });
  await page.route("**/audio/coach/*.mp3", route => route.abort());
  await page.goto("/train/needle-passing?fixture=needle-pass-good");
  await expect(page.getByTestId("fixture-banner")).toBeVisible();
  await expect(page.getByLabel("3D instrument workspace").locator("canvas")).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByTestId("degraded-notice")).toContainText("Network is unavailable");
  await page.getByTestId("ghost-reference-select").selectOption("jigsaws-expert-v1");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toBeVisible();
  await page.getByTestId("dismiss-reference-error").click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toHaveCount(0);

  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 20_000 });
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();
  await expect(page.getByTestId("deterministic-review")).toContainText("/100");
  await expect(page.getByTestId("overall-score")).toBeVisible();
  const score = Number(await page.getByTestId("overall-score").innerText());
  expect(score).toBeGreaterThan(0);

  await page.getByTestId("dismiss-degraded-notice").click();
  await expect(page.getByTestId("degraded-notice")).toHaveCount(0);
  await page.getByTestId("try-again-button").click();
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 20_000 });
  await expect(page.getByTestId("attempt-save-status")).toContainText("excluded from your saved attempt history");
  expect(live).toEqual([]);
  expect(errors).toEqual([]);
});
