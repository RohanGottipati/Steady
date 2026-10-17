import { expect, test, type Page } from "@playwright/test";

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

async function fakeDetector(page: Page) {
  await page.addInitScript(() => {
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage(message: { type: string; id?: number; bitmap?: ImageBitmap }) {
        if (message.type === "init") queueMicrotask(() => this.onmessage?.({ data: { type: "ready", delegate: "GPU" } }));
        if (message.type === "frame") {
          message.bitmap?.close();
          const points = (x: number) => Array.from({ length: 21 }, (_, index) => ({ x: x + (index % 4) / 100, y: 0.3 + index / 60, z: 0 }));
          queueMicrotask(() => this.onmessage?.({ data: {
            type: "result", id: message.id,
            result: { landmarks: [points(0.2), points(0.7)], worldLandmarks: [points(0), points(0)],
              handedness: [[{ categoryName: "Left", score: 0.99 }], [{ categoryName: "Right", score: 0.98 }]] },
          } }));
        }
      }
      terminate() { this.onmessage = null; }
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: FakeWorker });
  });
}

test("preview starts explicitly, displays tracking diagnostics and stops cleanly", async ({ page }) => {
  await fakeDetector(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dev/hand-tracking?debug=1");
  await expect(page.getByRole("status")).toHaveText("Status: idle");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await expect(page.getByRole("definition").filter({ hasText: "worker-gpu" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "99%" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "98%" })).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: idle");
  expect(await page.locator("video").evaluate(video => (video as HTMLVideoElement).srcObject)).toBeNull();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(errors).toEqual([]);
});

test("permission failure has a usable retry and debug stays hidden by default", async ({ page }) => {
  await fakeDetector(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let first = true;
    navigator.mediaDevices.getUserMedia = constraints => {
      if (first) { first = false; return Promise.reject(new DOMException("denied", "NotAllowedError")); }
      return original(constraints);
    };
  });
  await page.goto("/dev/hand-tracking");
  await expect(page.locator('dl[aria-label="Tracking diagnostics"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toContainText("permission was denied");
  await page.getByRole("button", { name: "Retry camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("real MediaPipe worker processes frames using local assets, including offline", async ({ page, context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const assets: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.url().includes("/mediapipe/")) assets.push(response.url()); });
  await page.goto("/dev/hand-tracking?debug=1");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running", { timeout: 60_000 });
  const backend = page.locator("dt", { hasText: /^Backend$/ }).locator("+ dd");
  await expect(backend, await page.locator("dl").innerText()).toHaveText(/^worker-(gpu|cpu)$/);
  const processed = page.locator("dt", { hasText: /^Processed frames$/ }).locator("+ dd");
  await expect.poll(async () => Number(await processed.textContent()), { timeout: 20_000 }).toBeGreaterThan(2);
  expect(assets.some(url => url.endsWith("hand_landmarker.task"))).toBe(true);
  expect(assets.some(url => url.includes("vision_wasm_internal.wasm"))).toBe(true);
  const beforeOffline = Number(await processed.textContent());
  await context.setOffline(true);
  try {
    await expect.poll(async () => Number(await processed.textContent()), { timeout: 20_000 }).toBeGreaterThan(beforeOffline + 2);
  } finally { await context.setOffline(false); }
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: idle");
  expect(errors).toEqual([]);
});

test("real main-thread backend works when workers are unavailable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => Object.defineProperty(window, "Worker", { configurable: true, value: undefined }));
  await page.goto("/dev/hand-tracking?debug=1");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running", { timeout: 40_000 });
  await expect(page.locator("dt", { hasText: /^Backend$/ }).locator("+ dd")).toHaveText(/^main-(gpu|cpu)$/);
  const processed = page.locator("dt", { hasText: /^Processed frames$/ }).locator("+ dd");
  await expect.poll(async () => Number(await processed.textContent())).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: idle");
});
