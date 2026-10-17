import { expect, test } from "@playwright/test";
import { Quaternion, Vector3 } from "three";

test.use({ launchOptions: { args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });
test.setTimeout(60_000);

test("S1 fixture replays and seeks issues in actual WebGL without a camera, preserving the cursor on renderer retry", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as unknown as { cameraCalls: number }).cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { cameraCalls: number }).cameraCalls++;
      throw new Error("The replay must not request a camera.");
    };
  });
  await page.goto("/train/needle-passing?fixture=needle-pass-late-rotation&debug=1");
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await expect(page.getByLabel("3D instrument workspace")).toHaveCount(0);
  const state = async () => JSON.parse(await page.getByTestId("replay-state").innerText());
  await page.getByTestId("replay-play").click();
  await expect.poll(async () => (await state()).timeMs).toBeGreaterThan(100);
  await page.getByTestId("replay-play").click();
  await page.getByLabel("Replay speed", { exact: true }).selectOption("0.25");
  await expect.poll(async () => (await state()).speed).toBe(0.25);
  await page.getByLabel("Replay comparison mode").selectOption("original");
  await page.getByTestId("replay-marker-0").click();
  await expect(page.getByLabel("Replay comparison mode")).toHaveValue("synchronized");
  const issue = await state(); expect(issue.playing).toBe(false); expect(issue.reference).not.toBeNull();
  await expect.poll(async () => {
    const s = await state();
    if (!s.rendered?.user.left || !s.user) return Infinity;
    const p = s.rendered.user.left.position, q = s.rendered.user.left.rotation;
    const tip = new Vector3(0, 0.35, 0).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w)).add(new Vector3(p.x, p.y, p.z));
    return tip.distanceTo(new Vector3(s.user.leftTool.tipPosition.x, s.user.leftTool.tipPosition.y, s.user.leftTool.tipPosition.z));
  }).toBeLessThan(1e-6);
  await page.getByLabel("Smooth replay", { exact: true }).check();
  await expect.poll(async () => (await state()).smoothing).toBe("centered-7");
  await page.getByLabel("Show reference", { exact: true }).uncheck();
  await expect.poll(async () => (await state()).rendered.reference.left).toBeNull();
  await page.getByLabel("Show reference", { exact: true }).check();
  await page.getByLabel("Replay timeline").focus(); await page.keyboard.press("Home");
  await expect.poll(async () => (await state()).timeMs).toBe(0);
  await page.getByTestId("replay-marker-0").click();
  const cursor = (await state()).timeMs;
  const canvas = page.getByLabel("3D attempt replay").locator("canvas");
  await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context loss is unavailable.");
    extension.loseContext();
  });
  await expect(page.getByTestId("replay-status")).toContainText("context lost");
  await page.getByRole("button", { name: "Retry replay scene" }).click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  expect((await state()).timeMs).toBe(cursor);
  await page.getByRole("region", { name: "Attempt replay", exact: true }).screenshot({ path: "test-results/a6-replay.png" });
  expect(await page.evaluate(() => (window as unknown as { cameraCalls: number }).cameraCalls)).toBe(0);
  await page.getByRole("button", { name: "Back to training" }).click();
  await expect(page.getByLabel("3D attempt replay")).toHaveCount(0);
  await expect(page.getByLabel("3D instrument workspace")).toBeVisible();
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page).toHaveURL(/\/library$/); expect(errors).toEqual([]);
});

test("B8: a results worst-moment opens the replay seeked to that issue", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/train/needle-passing?fixture=needle-pass-late-rotation&debug=1");
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 20_000 });

  // B8 deterministic AI-review fallback renders in the results.
  await expect(page.getByTestId("ai-review")).toBeVisible();
  await expect(page.getByTestId("ai-review-summary")).toContainText("Overall kinematic similarity");

  // Jumping to the top issue from the results page lands on the same cursor as the
  // in-replay marker 0 (both seek worstMoments[0]), proving the results-to-replay seek.
  const state = async () => JSON.parse(await page.getByTestId("replay-state").innerText());
  await page.getByTestId("worst-moment-0").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  const fromResults = (await state()).timeMs;
  await page.getByLabel("Replay timeline").focus(); await page.keyboard.press("Home");
  await expect.poll(async () => (await state()).timeMs).toBe(0);
  await page.getByTestId("replay-marker-0").click();
  expect((await state()).timeMs).toBe(fromResults);
  expect(fromResults).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
