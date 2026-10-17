import { expect, test, type Page } from "@playwright/test";
import { controlHand, type HandOptions } from "../fixtures/hand-controls";

type FixtureWindow = Window & {
  makeControlHand: typeof controlHand;
  handInput: { left: HandOptions | null; right: HandOptions | null };
  workspaceTimer?: number;
};

test.use({ permissions: ["camera"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

async function fakeHands(page: Page) {
  await page.addInitScript({ content: `window.makeControlHand = ${controlHand.toString()};` });
  await page.addInitScript(() => {
    const fixture = window as unknown as FixtureWindow;
    fixture.handInput = { left: {}, right: {} };
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage(message: { type: string; id?: number; bitmap?: ImageBitmap }) {
        if (message.type === "init") queueMicrotask(() => this.onmessage?.({ data: { type: "ready", delegate: "GPU" } }));
        if (message.type === "frame") {
          message.bitmap?.close();
          const hands = (["Left", "Right"] as const).flatMap(label => {
            const options = fixture.handInput[label === "Left" ? "left" : "right"];
            return options ? [fixture.makeControlHand(label, options)] : [];
          });
          queueMicrotask(() => this.onmessage?.({ data: { type: "result", id: message.id, result: {
            landmarks: hands.map(h => h.landmarks), worldLandmarks: hands.map(h => h.worldLandmarks),
            handedness: hands.map(h => [{ categoryName: h.handedness, score: h.handednessConfidence }]),
          } } }));
        }
      }
      terminate() { this.onmessage = null; }
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: FakeWorker });
  });
}

async function setHands(page: Page, left: HandOptions | null, right: HandOptions | null = {}) {
  await page.evaluate(input => { (window as unknown as FixtureWindow).handInput = input; }, { left, right });
}

async function calibrate(page: Page) {
  await page.getByRole("button", { name: /^(Calibrate controls|Retry calibration|Recalibrate controls)$/ }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: pinch");
  await setHands(page, { ratio: 0.1 }, { ratio: 0.15 });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: workspace");
  await page.evaluate(() => {
    const fixture = window as unknown as FixtureWindow;
    let frame = 0;
    fixture.workspaceTimer = window.setInterval(() => {
      const angle = frame++ / 60 * Math.PI * 2;
      fixture.handInput = {
        left: { x: 0.7 + 0.08 * Math.cos(angle), y: 0.5 + 0.08 * Math.sin(angle) },
        right: { x: 0.3 + 0.08 * Math.cos(angle), y: 0.5 + 0.08 * Math.sin(angle) },
      };
    }, 40);
  });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: ready", { timeout: 12_000 });
  await page.evaluate(() => { const fixture = window as unknown as FixtureWindow; clearInterval(fixture.workspaceTimer); fixture.handInput = { left: {}, right: {} }; });
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
}

test("guided controls map movement, retain grip through loss, recover, and reset on camera restart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fakeHands(page);
  await page.goto("/dev/hand-tracking?debug=1");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await calibrate(page);
  await setHands(page, { x: 0.6, y: 0.4, scale: 2, ratio: 0.1 });
  const left = page.getByLabel("left control target", { exact: true });
  await expect(left).toContainText("grip closed");
  await expect(left).toContainText("z 0.150");
  await page.getByRole("checkbox", { name: /Planar depth fallback/ }).check();
  await expect(left).toContainText("z 0.000");
  await setHands(page, null);
  await expect(left).toContainText("lost");
  await expect(left).toContainText("grip closed");
  await expect(page.getByTestId("control-readiness")).toContainText("paused");
  await setHands(page, { ratio: 0.1 });
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
  await expect(left).toContainText("grip closed");
  await setHands(page, {});
  await expect(left).toContainText("grip open");
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: idle");
  await expect(left).not.toContainText("grip");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: idle");
  await page.getByRole("button", { name: "Stop camera" }).click();
  expect(errors).toEqual([]);
});

test("missing hands cannot complete calibration and cancellation permits a clean retry", async ({ page }) => {
  await fakeHands(page);
  await page.goto("/dev/hand-tracking");
  await expect(page.getByRole("button", { name: "Calibrate controls" })).toBeDisabled();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await setHands(page, null);
  await page.getByRole("button", { name: "Calibrate controls" }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Keep both hands fully visible");
  await page.getByRole("button", { name: "Cancel calibration" }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("cancelled");
  await setHands(page, {});
  await calibrate(page);
  await expect(page.getByLabel("left pinch diagnostics", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("workspace arrows guide one hand at a time and retain completed movements through tracking loss", async ({ page }) => {
  await fakeHands(page);
  await page.goto("/dev/hand-tracking?debug=1");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await page.getByRole("button", { name: "Calibrate controls" }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: pinch");
  await setHands(page, { ratio: 0.1 }, { ratio: 0.1 });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: workspace");
  const guide = page.getByRole("region", { name: "Workspace movement guide" });
  const left = guide.getByRole("group", { name: "left hand workspace" });
  const right = guide.getByRole("group", { name: "right hand workspace" });
  await expect(guide).toContainText("Move one open hand at a time");
  await setHands(page, { x: 0.76 });
  await expect(left.getByRole("listitem", { name: "left: captured", exact: true })).toBeVisible();
  await setHands(page, null, { x: 0.36 });
  await expect(guide).toContainText("Completed arrows are saved");
  await expect(right.getByRole("listitem", { name: "left: captured", exact: true })).toBeVisible();
  await expect(left.getByRole("listitem", { name: "left: captured", exact: true })).toBeVisible();
  for (const [direction, pose] of [["right", { x: 0.64 }], ["up", { y: 0.44 }], ["down", { y: 0.56 }]] as const) {
    await setHands(page, pose);
    await expect(left.getByRole("listitem", { name: `${direction}: captured`, exact: true })).toBeVisible();
  }
  for (const [direction, pose] of [["right", { x: 0.24 }], ["up", { y: 0.44 }]] as const) {
    await setHands(page, {}, pose);
    await expect(right.getByRole("listitem", { name: `${direction}: captured`, exact: true })).toBeVisible();
  }
  await setHands(page, {}, { y: 0.56 });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: ready");
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
  await page.getByRole("button", { name: "Stop camera" }).click();
});
