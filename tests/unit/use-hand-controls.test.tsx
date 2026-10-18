import { act, Activity, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHandControls } from "@/lib/vision/use-hand-controls";
import { HandControlsController } from "@/lib/vision/hand-controls";
import { emptySnapshot, type TrackingStatus } from "@/lib/vision/types";
import type { useHandTracking } from "@/lib/vision/use-hand-tracking";
import { controlUiKey, projectControlUi } from "@/lib/vision/control-ui";
import { cameraSize, controlFrame } from "../fixtures/hand-controls";

describe("hand control hook lifecycle", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  async function harness(strict = false) {
    vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let time = 0, sequence = 0, renders = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => time);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
    const video = document.createElement("video");
    Object.defineProperties(video, { videoWidth: { value: cameraSize.width }, videoHeight: { value: cameraSize.height } });
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    video.srcObject = stream;
    video.pause = vi.fn();
    const tracking = {
      videoRef: { current: video }, snapshotRef: { current: emptySnapshot() },
      diagnosticsRef: { current: { backend: "worker-gpu", trackingFps: 30, inferenceMs: 10, processedFrames: 0 } },
      state: { status: "running" as TrackingStatus }, start: vi.fn(), stop: vi.fn(),
    } as ReturnType<typeof useHandTracking>;
    let controls!: ReturnType<typeof useHandControls>;
    function Harness() { renders++; controls = useHandControls(tracking); return <span>{controls.ui.calibration.stage}</span>; }
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    const render = async (mode: "visible" | "hidden" = "visible") => {
      await act(async () => root.render(strict ? <StrictMode><Harness /></StrictMode> : <Activity mode={mode}><Harness /></Activity>));
    };
    await render();
    const tick = async (ratio = 0.9, angle?: number) => {
      time += 40;
      const offset = angle === undefined ? { x: 0, y: 0 } : { x: 0.08 * Math.cos(angle), y: 0.08 * Math.sin(angle) };
      tracking.snapshotRef.current = controlFrame(time, { ratio, x: 0.7 + offset.x, y: 0.5 + offset.y }, { ratio, x: 0.3 + offset.x, y: 0.5 + offset.y });
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time));
    };
    const calibrate = async () => {
      await act(async () => controls.calibrate());
      for (let i = 0; i < 32; i++) await tick();
      for (let i = 0; i < 22; i++) await tick(0.1);
      for (let i = 0; i < 48; i++) await tick(0.9, i / 44 * Math.PI * 2);
      expect(controls.snapshotRef.current.calibrated).toBe(true);
    };
    return { render, tick, calibrate, tracking, video, stop, frames, controls: () => controls, renders: () => renders,
      sample: async () => act(async () => { await vi.advanceTimersByTimeAsync(250); }),
      dispose: async () => { await act(async () => root.unmount()); container.remove(); } };
  }

  it("does not rerender at tracking FPS and cancels all work under Strict Mode without stopping the tracker", async () => {
    const h = await harness(true);
    try {
      await h.calibrate();
      const initialRenders = h.renders();
      for (let i = 0; i < 30; i++) await h.tick();
      expect(h.renders()).toBe(initialRenders);
      expect(h.frames.size).toBe(1);
      await h.sample(); expect(h.renders()).toBeGreaterThan(initialRenders);
    } finally { await h.dispose(); }
    expect(h.frames.size).toBe(0);
    expect(h.stop).not.toHaveBeenCalled();
    expect(h.video.pause).not.toHaveBeenCalled();
    expect(h.controls().snapshotRef.current.calibrated).toBe(false);
  });

  it("preserves a profile over backend fallback but resets it on stop, stream replacement and Activity remount", async () => {
    const h = await harness();
    try {
      await h.calibrate();
      h.tracking.state = { status: "starting" }; await h.render();
      expect(h.controls().snapshotRef.current.canProgress).toBe(false);
      expect(h.controls().snapshotRef.current.calibrated).toBe(true);
      h.tracking.state = { status: "running" }; await h.render();
      await h.tick(); await h.tick(); expect(h.controls().snapshotRef.current.canProgress).toBe(false);
      await h.tick(); expect(h.controls().snapshotRef.current.canProgress).toBe(true);
      h.tracking.state = { status: "idle" }; await h.render();
      expect(h.controls().snapshotRef.current.calibrated).toBe(false);
      h.tracking.state = { status: "running" }; await h.render();
      await h.calibrate();
      h.video.srcObject = {} as MediaStream; await h.tick();
      expect(h.controls().snapshotRef.current.calibrated).toBe(false);
      await h.calibrate();
      await h.render("hidden"); expect(h.frames.size).toBe(0);
      await h.render("visible"); await h.sample();
      expect(h.controls().snapshotRef.current.calibrated).toBe(false);
      expect(h.controls().ui.calibration.stage).toBe("idle");
      expect(h.frames.size).toBe(1);
    } finally { await h.dispose(); }
  });

  it("does not rerender when only landmark arrays change", async () => {
    const h = await harness();
    try {
      await h.calibrate();
      for (let i = 0; i < 4 && h.controls().ui.calibration.stage !== "ready"; i += 1) await h.sample();
      expect(h.controls().ui.calibration.stage).toBe("ready");
      const snapshot = h.controls().snapshotRef.current;
      const hand = snapshot.left.hand;
      expect(hand?.landmarks.length).toBeGreaterThan(0);
      const projected = projectControlUi(snapshot);
      expect(JSON.stringify(projected)).not.toMatch(/landmarks/);
      hand!.landmarks = hand!.landmarks.map(point => ({ ...point, x: point.x + 1 }));
      hand!.worldLandmarks = hand!.worldLandmarks.map(point => ({ ...point, y: point.y + 1 }));
      expect(controlUiKey(projectControlUi(snapshot))).toBe(controlUiKey(projected));
      const moved = projectControlUi(snapshot);
      snapshot.left.target!.position = { ...snapshot.left.target!.position, x: snapshot.left.target!.position.x + 0.05 };
      expect(controlUiKey(projectControlUi(snapshot))).not.toBe(controlUiKey(moved));
    } finally { await h.dispose(); }
  });

  it("suspends immediately on visibility loss and removes its listener on unmount", async () => {
    const h = await harness();
    const suspend = vi.spyOn(HandControlsController.prototype, "suspend");
    try {
      await h.calibrate();
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(h.controls().snapshotRef.current.canProgress).toBe(false);
      expect(h.controls().snapshotRef.current.left.hand).toBeNull();
      expect(h.controls().snapshotRef.current.left.target).not.toBeNull();
    } finally { await h.dispose(); }
    suspend.mockClear(); document.dispatchEvent(new Event("visibilitychange"));
    expect(suspend).not.toHaveBeenCalled();
  });
});
