import { expect, type Page } from "@playwright/test";
import { controlHand, type HandOptions } from "./hand-controls";

export type FixtureWindow = Window & {
  makeControlHand: typeof controlHand;
  handInput: { left: HandOptions | null; right: HandOptions | null };
  workspaceTimer?: number;
  cameraRequests?: number;
};

export async function fakeHands(page: Page) {
  await page.addInitScript({ content: `window.makeControlHand = ${controlHand.toString()};` });
  await page.addInitScript(() => {
    const fixture = window as unknown as FixtureWindow;
    fixture.handInput = { left: {}, right: {} };
    fixture.cameraRequests = 0;
    const originalCamera = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => { fixture.cameraRequests!++; return originalCamera(constraints); };
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

export async function setHands(page: Page, left: HandOptions | null, right: HandOptions | null = {}) {
  await page.evaluate(input => { (window as unknown as FixtureWindow).handInput = input; }, { left, right });
}

export async function calibrate(page: Page, left: HandOptions = {}, right: HandOptions = {}) {
  await setHands(page, left, right);
  await page.getByRole("button", { name: /^(Calibrate controls|Retry calibration|Recalibrate controls)$/ }).click();
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: pinch", { timeout: 15_000 });
  await setHands(page, { ...left, ratio: 0.1 }, { ...right, ratio: 0.15 });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: workspace", { timeout: 15_000 });
  await page.evaluate(({ left, right }) => {
    const fixture = window as unknown as FixtureWindow;
    let frame = 0;
    fixture.workspaceTimer = window.setInterval(() => {
      const angle = frame++ / 60 * Math.PI * 2;
      fixture.handInput = {
        left: { ...left, x: (left.x ?? 0.7) + 0.08 * Math.cos(angle), y: (left.y ?? 0.5) + 0.08 * Math.sin(angle) },
        right: { ...right, x: (right.x ?? 0.3) + 0.08 * Math.cos(angle), y: (right.y ?? 0.5) + 0.08 * Math.sin(angle) },
      };
    }, 40);
  }, { left, right });
  await expect(page.getByTestId("calibration-status")).toContainText("Calibration: ready", { timeout: 12_000 });
  await page.evaluate(({ left, right }) => { const fixture = window as unknown as FixtureWindow; clearInterval(fixture.workspaceTimer); fixture.handInput = { left, right }; }, { left, right });
  await expect(page.getByTestId("control-readiness")).toHaveText("Controls ready");
}
