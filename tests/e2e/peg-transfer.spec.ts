import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});
test.setTimeout(60_000);

test("peg transfer trains on the shared route while coming-soon skills stay gated", async ({ page }) => {
  const errors: string[] = [];
  const live: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/api\/(speech|attempts|review)|elevenlabs|backboard/i.test(request.url())) live.push(request.url());
  });

  await page.goto("/train/knot-tying");
  await expect(page.getByText("This skill is coming soon.")).toBeVisible();
  await page.goto("/train/suturing");
  await expect(page.getByText("This skill is coming soon.")).toBeVisible();
  await page.goto("/train/not-a-skill");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Train Peg Transfer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Train Needle Passing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Knot Tying — coming soon" })).toBeVisible();

  await page.goto("/train/peg-transfer?fixture=peg-transfer-good");
  await expect(page.getByRole("heading", { name: "Peg Transfer" })).toBeVisible();
  await expect(page.getByLabel("Simulation diagnostics")).toHaveCount(0);
  await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
  const canvas = page.getByLabel("3D instrument workspace").locator("canvas");
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.height).toBeGreaterThan(250);
  await expect(page.getByText("Lift clear of the post")).toBeVisible();
  await page.getByRole("button", { name: /Assessment/ }).click();
  await expect(page.getByTestId("exercise-ghost-status")).toHaveText("Ghost: disabled in assessment");
  await expect(page.getByTestId("ghost-toggle")).toHaveCount(0);
  await expect(page.getByTestId("exercise-phase")).toHaveText("Phase: complete", { timeout: 20_000 });
  await expect(page.getByTestId("exercise-segment")).toContainText("Segment: complete");
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible();
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await expect(page.getByTestId("replay-explanation")).toBeVisible();
  expect(live).toEqual([]);
  expect(errors).toEqual([]);
});
