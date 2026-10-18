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
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Credits", exact: true })).toHaveCount(0);
  await expect(page.getByText("Anonymous · device-scoped · no account")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Licenses & notices" })).toBeVisible();
  await expect(page.getByLabel("Demonstration of the Steady operating room").locator("canvas")).toBeVisible();
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
    page.getByRole("link", { name: "Train Suturing" }),
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
  await page.getByRole("button", { name: "Settings & guide", exact: true }).click();
  await page.getByRole("checkbox", { name: /Reduced graphics/ }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings & guide", exact: true })).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Session settings and guidance" })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/acceptance/training-mobile.png", fullPage: true });
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


test("immersive workspace keeps settings contextual and supports fullscreen", async ({ page }) => {
  await page.goto("/train/needle-passing?fixture=needle-pass-good");
  await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
  const viewport = page.locator(".workspace-viewport");
  await expect(viewport).toBeVisible();
  const scene = await viewport.boundingBox();
  expect(scene!.width).toBeGreaterThan(1100);
  const settings = page.getByRole("button", { name: "Settings & guide", exact: true });
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: /Reduced graphics/ })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toBeFocused();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit fullscreen", exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fullscreen", exact: true })).toBeVisible();
  await page.goto("/notices");
  await expect(page.getByRole("heading", { name: "Licenses & notices", exact: true })).toBeVisible();
  await expect(page.getByText(/Hand tracking uses the MediaPipe/)).toBeVisible();
});


for (const width of [1280, 390]) {
  test(`training frame stays the same size through live updates at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/train/needle-passing?fixture=needle-pass-late-rotation");
    const viewport = page.locator(".workspace-viewport");
    await expect(viewport.locator("canvas")).toBeVisible();
    await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
    await page.evaluate(() => {
      const observed = document.querySelector(".workspace-viewport")!;
      const sizes: string[] = [];
      const observer = new ResizeObserver(([entry]) => {
        sizes.push(`${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`);
      });
      observer.observe(observed);
      Object.assign(window, { trainingFrameSizes: sizes, trainingFrameObserver: observer });
    });
    await page.getByText("Session details", { exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("degraded-notice")).toBeVisible();
    await page.getByTestId("dismiss-degraded-notice").click();
    await page.getByRole("button", { name: "Settings & guide", exact: true }).click();
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 30_000 });
    const sizes = await page.evaluate(() => {
      const state = window as unknown as {
        trainingFrameSizes: string[]; trainingFrameObserver: ResizeObserver;
      };
      state.trainingFrameObserver.disconnect();
      return state.trainingFrameSizes;
    });
    expect(sizes.length).toBeGreaterThan(0);
    expect([...new Set(sizes)]).toHaveLength(1);
  });
}
