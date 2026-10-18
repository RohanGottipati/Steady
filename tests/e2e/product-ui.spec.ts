import { expect, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
});

const response = {
  summary: { attempts: 2, bestScore: 80, avgScore: 40 },
  progress: [
    {
      skillId: "needle-passing",
      attempts: 2,
      bestScore: 80,
      avgScore: 40,
      latestScore: 80,
      latestAt: "2026-10-18T00:00:00Z",
      avgCategoryScores: {
        precision: 0,
        control: 40,
        technique: 50,
        coordination: 60,
        efficiencySafety: 70,
      },
      trend: [
        {
          attemptId: "a",
          completedAt: "2026-10-17T00:00:00Z",
          overallScore: 0,
        },
        {
          attemptId: "b",
          completedAt: "2026-10-18T00:00:00Z",
          overallScore: 80,
        },
      ],
    },
  ],
};

test("public pages use the new design and real catalog at desktop and narrow widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Train the motion/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Camera stays off until you start"),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/acceptance/landing-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Library" })
    .click();
  await expect(
    page.getByRole("link", { name: "Train Peg Transfer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Suturing — coming soon" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Surgical Skills Library" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/acceptance/library-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("progress renders real trends, preserves history on failed delete and clears it after success", async ({
  page,
}) => {
  let removed = false;
  let deleteCalls = 0;
  await page.route("**/api/progress?**", (route) =>
    route.fulfill({
      json: removed
        ? {
            progress: [],
            summary: { attempts: 0, bestScore: null, avgScore: null },
          }
        : response,
    }),
  );
  await page.route("**/api/attempts?**", (route) => {
    deleteCalls++;
    if (deleteCalls === 1)
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    removed = true;
    return route.fulfill({ json: { status: "deleted" } });
  });
  await page.goto("/progress");
  await expect(
    page.getByRole("img", { name: "Score trend: 0, 80" }),
  ).toBeVisible();
  await expect(
    page.getByText("Average category scores · all synced attempts"),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/acceptance/progress-desktop.png",
    fullPage: true,
  });
  await page.getByTestId("delete-history").click();
  await expect(page.getByTestId("delete-error")).toContainText(
    "Could not delete",
  );
  await expect(page.getByTestId("progress-list")).toBeVisible();
  await page.getByTestId("delete-history").click();
  await expect(page.getByTestId("progress-empty")).toBeVisible();
  expect(deleteCalls).toBe(2);
});

test("progress distinguishes unavailable service, retry and an empty history", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/progress?**", (route) =>
    available
      ? route.fulfill({
          json: {
            progress: [],
            summary: { attempts: 0, bestScore: null, avgScore: null },
          },
        })
      : route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.goto("/progress");
  await expect(page.getByTestId("progress-unconfigured")).toBeVisible();
  available = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTestId("progress-empty")).toBeVisible();
});

test("sample workspace is responsive, offers reduced graphics and never requests the camera", async ({
  page,
}) => {
  let cameras = 0;
  await page.exposeFunction("unexpectedCamera", () => {
    cameras++;
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      await (
        window as unknown as { unexpectedCamera: () => Promise<void> }
      ).unexpectedCamera();
      throw new Error("No camera in sample mode");
    };
  });
  await page.goto("/train/needle-passing?fixture=needle-pass-good");
  await expect(
    page.getByLabel("3D instrument workspace").locator("canvas"),
  ).toBeVisible();
  await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/acceptance/training-desktop.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: /Reduced graphics/ }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({
    path: "artifacts/acceptance/results-mobile.png",
    fullPage: true,
  });
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await expect(
    page.getByRole("button", { name: "Back to training" }),
  ).toBeVisible();
  expect(cameras).toBe(0);
});
