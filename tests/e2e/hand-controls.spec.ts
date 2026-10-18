import { expect, test } from "@playwright/test";
import { Quaternion, Vector3 } from "three";
import { fakeHands, setHands, calibrate } from "../fixtures/browser-controls";

test.use({ permissions: ["camera"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

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
  await expect(guide).toContainText("Move one relaxed hand at a time");
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

test("lower palms-down hands calibrate, move independently, roll along the shaft and pinch on the training page", async ({ page }) => {
  test.setTimeout(45_000);
  await fakeHands(page);
  await page.goto("/train/needle-passing?fixture=off&debug=1");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Status: running");
  const neutral = (inward: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), inward)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.3));
  const plain = (q: Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
  const left = { x: 0.65, y: 0.8, ratio: 0.4, rotation: plain(neutral(0.15)) };
  const right = { x: 0.35, y: 0.82, ratio: 0.45, rotation: plain(neutral(-0.15)) };
  await calibrate(page, left, right);
  const leftTarget = page.getByLabel("left control target", { exact: true });
  const rightTarget = page.getByLabel("right control target", { exact: true });
  await expect(leftTarget).toContainText("x -0.500");
  await expect(rightTarget).toContainText("x 0.500");
  await expect(leftTarget).toContainText("grip open");
  const stream = await page.locator("video").evaluate(video => (video as HTMLVideoElement).srcObject ? true : false);
  expect(stream).toBe(true);
  await page.getByLabel("3D instrument workspace", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId("camera-preview-frame")).toHaveAttribute("data-floating", "true");
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
  await page.getByTestId("camera-preview-anchor").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("camera-preview-frame")).toHaveAttribute("data-floating", "false");
  const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
  await expect(page.getByLabel("Surgical orientation diagnostics", { exact: true })).toHaveCount(production ? 0 : 1);
  if (!production) {
    await page.getByText("Wrist orientation diagnostics", { exact: true }).click();
    await expect(page.getByLabel("left orientation diagnostics", { exact: true })).toContainText("roll: 0°");
    await page.getByText("Wrist orientation diagnostics", { exact: true }).click();
  }
  await page.getByLabel("Camera and calibration", { exact: true }).screenshot({ path: "test-results/surgical-posture-neutral.png" });
  const moved = { ...left, x: left.x - 0.03, y: left.y - 0.02 };
  await setHands(page, moved, right);
  await expect.poll(async () => Number((await leftTarget.innerText()).match(/x ([\d.-]+)/)![1])).toBeGreaterThan(-0.4);
  await expect(rightTarget).toContainText("x 0.500");
  const rolled = { ...moved, rotation: plain(neutral(0.15).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.35))) };
  await setHands(page, rolled, right);
  if (!production) {
    await page.getByText("Wrist orientation diagnostics", { exact: true }).click();
    await expect(page.getByLabel("left orientation diagnostics", { exact: true })).toContainText("roll: 20°");
    await page.getByText("Wrist orientation diagnostics", { exact: true }).click();
  }
  await setHands(page, { ...rolled, ratio: 0.1 }, right);
  await expect(leftTarget).toContainText("grip closed");
  await expect(rightTarget).toContainText("grip open");
  await setHands(page, rolled, right);
  await expect(leftTarget).toContainText("grip open");
  await setHands(page, null, right);
  await expect(leftTarget).toContainText("lost");
  await expect(rightTarget).toContainText("tracking");
  await setHands(page, left, right);
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
});
