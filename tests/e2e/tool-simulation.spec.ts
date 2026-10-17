import { expect, test, type Page } from "@playwright/test";
import { calibrate, fakeHands, setHands, type FixtureWindow } from "../fixtures/browser-controls";

test.use({ permissions: ["camera"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(45_000);

async function instrument(page: Page, side: "left" | "right") {
  const text = await page.getByTestId(`${side}-instrument-state`).innerText();
  return JSON.parse(text.slice(text.indexOf(":") + 1)) as { sourceTMs: number | null; tool: { position: { x: number }; tipPosition: { x: number; y: number; z: number }; jawClosed: boolean } | null; rendered: { position: { x: number } } | null };
}
async function start(page: Page) {
  await fakeHands(page);
  await page.goto("/dev/hand-tracking?debug=1");
  await expect(page.getByTestId("simulation-status")).toHaveText("Calibrate both hands to begin.");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await calibrate(page);
  await expect(page.getByTestId("simulation-status")).toHaveText("Simulation ready");
}

async function approachNeedle(page: Page) {
  // Calibration captures sustained directions, so the measured travel varies with
  // inference cadence. Approach using observed geometry instead of assuming a range.
  let x = 0.7;
  let stable = 0, lastSource: number | null = null;
  await setHands(page, { x });
  await expect.poll(async () => {
    const observed = await instrument(page, "left");
    if (!observed.tool || observed.sourceTMs === lastSource) return stable;
    lastSource = observed.sourceTMs;
    const error = observed.tool.tipPosition.x;
    if (Math.abs(error) >= 0.04) { stable = 0; x += error * 0.02; await setHands(page, { x }); }
    else if (!observed.tool.jawClosed && Math.abs(observed.rendered!.position.x - observed.tool.position.x) < 0.005) stable++;
    else stable = 0;
    return stable;
  }, { timeout: 10_000, intervals: [300] }).toBeGreaterThanOrEqual(3);
  return x;
}

test("rendered instruments acquire, freeze together through loss, recover, release and reset with one camera", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await start(page);
  const pickupX = await approachNeedle(page);
  await expect(page.getByRole("checkbox", { name: /Easy pickup/ })).toBeChecked();
  await expect(page.getByTestId("pickup-guidance")).toContainText("tip aligned");
  await page.getByRole("region", { name: "Virtual instrument preview" }).screenshot({ path: "test-results/a3-ready.png" });
  await expect.poll(async () => Math.abs((await instrument(page, "left")).rendered!.position.x - (await instrument(page, "left")).tool!.position.x)).toBeLessThan(0.02);
  await setHands(page, { x: pickupX, scale: 1.7, ratio: 0.1 });
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await expect.poll(async () => (await instrument(page, "left")).tool?.tipPosition.z).toBeCloseTo(0, 6);
  await expect(page.getByTestId("pickup-guidance")).toContainText("Open your thumb");
  await setHands(page, { x: pickupX - 0.015, ratio: 0.1 });
  await expect.poll(async () => (JSON.parse(await page.getByTestId("needle-state").innerText()) as { object: { position: { x: number } } }).object.position.x).toBeGreaterThan(0.1);
  await setHands(page, null);
  await expect(page.getByTestId("simulation-status")).toContainText("paused");
  const before = await instrument(page, "right");
  await setHands(page, null, { x: 0.2 });
  await expect(page.getByLabel("right control target", { exact: true })).toContainText("x 1.250");
  expect(await instrument(page, "right")).toEqual(before);
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await setHands(page, { x: pickupX - 0.015, ratio: 0.1 });
  await expect(page.getByTestId("simulation-status")).toHaveText("Simulation ready");
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await setHands(page, { x: pickupX - 0.015 });
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: free");
  await page.getByRole("button", { name: "Reset scene" }).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("needle-state").innerText()).object?.position).toEqual({ x: 0, y: 0.35, z: 0 });
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).cameraRequests)).toBe(1);
  await page.getByRole("region", { name: "Virtual instrument preview" }).screenshot({ path: "test-results/a3-instruments.png" });
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect.poll(async () => (await instrument(page, "left")).tool).toBeNull();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: idle");
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: free");
  let stopped = 0;
  await page.exposeFunction("cameraStopped", () => { stopped++; });
  await page.locator("video").evaluate(element => {
    for (const track of ((element as HTMLVideoElement).srcObject as MediaStream).getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); void (window as unknown as { cameraStopped: () => Promise<void> }).cameraStopped(); };
    }
  });
  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect.poll(() => stopped).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("depth assistance can be switched without recalibration and resets ownership", async ({ page }) => {
  await start(page);
  const pickupX = await approachNeedle(page);
  await setHands(page, { x: pickupX, scale: 2 });
  await expect(page.getByTestId("pickup-guidance")).toContainText("tip aligned");
  const easy = page.getByRole("checkbox", { name: /Easy pickup/ });
  await easy.uncheck();
  await expect.poll(async () => (await instrument(page, "left")).tool?.tipPosition.z).toBeCloseTo(0.15, 3);
  await expect(page.getByTestId("pickup-guidance")).toContainText("Depth is off");
  await easy.check();
  await expect(page.getByTestId("pickup-guidance")).toContainText("tip aligned");
  await setHands(page, { x: pickupX, scale: 2, ratio: 0.1 });
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await easy.uncheck();
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: free");
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: ready");
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("WebGL context loss holds ownership and restoration accepts fresh input", async ({ page }) => {
  await start(page);
  const pickupX = await approachNeedle(page);
  await setHands(page, { x: pickupX, ratio: 0.1 });
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  const canvas = page.getByLabel("3D instrument workspace").locator("canvas");
  await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context-loss extension unavailable");
    (window as unknown as { restoreScene: () => void }).restoreScene = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(page.getByTestId("simulation-status")).toContainText("context lost");
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await page.evaluate(() => (window as unknown as { restoreScene: () => void }).restoreScene());
  await expect(page.getByTestId("simulation-status")).toHaveText("Simulation ready");
  await expect(page.getByTestId("needle-ownership")).toHaveText("Needle: left-tool");
  await page.getByRole("button", { name: "Stop camera" }).click();
});

test("unavailable WebGL has an actionable retry while the tracking preview remains usable", async ({ page }) => {
  await fakeHands(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === "webgl2" || kind === "webgl" || kind === "experimental-webgl") return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto("/dev/hand-tracking");
  await expect(page.getByTestId("simulation-status")).toHaveText("3D rendering unavailable");
  await expect(page.getByRole("button", { name: "Retry 3D scene" })).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  await page.getByRole("button", { name: "Retry 3D scene" }).click();
  await expect(page.getByTestId("simulation-status")).toHaveText("3D rendering unavailable");
  await expect(page.getByLabel("Simulation diagnostics")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop camera" }).click();
});
