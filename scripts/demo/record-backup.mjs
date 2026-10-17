#!/usr/bin/env node
// Records a silent fixture walkthrough. It never requests a camera or paid service.
import { chromium, expect } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "artifacts/demo");
const baseURL = process.argv[2] ?? "http://localhost:3068";
const address = new URL(baseURL);
if (!["localhost", "127.0.0.1"].includes(address.hostname)) throw new Error("Use a local Steady server.");
let server;
let browser;
const available = async () => {
  try { return (await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
};

try {
  await mkdir(output, { recursive: true });
  if (!await available()) {
    server = spawn("npm", ["run", "start", "--", "--port", address.port || "3068"], {
      cwd: root, detached: true, stdio: "ignore",
      env: { ...process.env, TIGER_DATABASE_URL: "", BACKBOARD_API_KEY: "", SPEECH_ENABLED: "false" },
    });
    const deadline = Date.now() + 45_000;
    while (!await available()) {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error("Build first with npm run build, then retry the recording.");
      await pause(250);
    }
  }
  browser = await chromium.launch({ args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    colorScheme: "light", recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
  const page = await context.newPage();
  const errors = [];
  const live = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/\/api\/(speech|attempts|review)|elevenlabs|backboard/i, route => {
    live.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("This recording uses sample motion only."));
  });
  await page.goto(`${baseURL}/library`);
  await expect(page.getByRole("link", { name: "Train Peg Transfer" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "library.png") });
  await pause(1500);

  await page.goto(`${baseURL}/train/needle-passing?fixture=needle-pass-late-rotation`);
  const workspace = page.getByLabel("3D instrument workspace");
  await expect(workspace.locator("canvas")).toBeVisible();
  await workspace.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
  await pause(1000);
  await page.screenshot({ path: resolve(output, "needle-passing.png") });
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("attempt-results-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "results.png") });
  await pause(2000);
  await page.getByTestId("open-attempt-replay").click();
  await expect(page.getByTestId("replay-status")).toContainText("Replay ready");
  await page.getByRole("region", { name: "Attempt replay" }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId("replay-focus")).toContainText("Paused", { timeout: 30_000 });
  await page.screenshot({ path: resolve(output, "replay.png") });
  await pause(2500);

  await page.goto(`${baseURL}/train/peg-transfer?fixture=peg-transfer-good`);
  await expect(workspace.locator("canvas")).toBeVisible();
  await workspace.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("viewport-loading")).toHaveCount(0);
  await pause(1000);
  await page.screenshot({ path: resolve(output, "peg-transfer.png") });
  await expect(page.getByTestId("attempt-results-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("attempt-results-panel").scrollIntoViewIfNeeded();
  await pause(1500);
  if (errors.length || live.length) throw new Error(JSON.stringify({ errors, live }));
  const video = page.video();
  await context.close();
  const movie = resolve(output, "steady-backup.webm");
  await video.saveAs(movie);
  await video.delete();
  const mp4 = resolve(output, "steady-backup.mp4");
  const converted = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", movie,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", mp4]);
  console.log(`Recorded ${movie} (${(await stat(movie)).size} bytes).`);
  if (converted.status === 0) console.log(`MP4 copy: ${mp4}`);
  console.log("Silent sample-motion walkthrough; screenshots and on-screen explanations are included.");
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* The local server already exited. */ }
  }
}
