import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { TrackingController, cameraErrorMessage } from "@/lib/vision/tracking-controller";
import { emptySnapshot, type DetectionBackend, type TrackingDiagnostics } from "@/lib/vision/types";
import { deferred, detection } from "../fixtures/vision";

describe("tracking controller lifecycle", () => {
  let time: number;
  let callbacks: Map<number, VideoFrameRequestCallback>;
  let controller: TrackingController;
  let video: HTMLVideoElement;
  let stopTrack: ReturnType<typeof vi.fn>;
  let track: EventTarget & { stop: ReturnType<typeof vi.fn> };
  let stream: MediaStream;
  let backend: DetectionBackend;
  let getUserMedia: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>;
  let fallback: Mock<(signal: AbortSignal) => Promise<DetectionBackend>>;
  const snapshot = { current: emptySnapshot() };
  const diagnostics = { current: {} as TrackingDiagnostics };
  const onState = vi.fn();
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const tick = async () => {
    time += 40;
    video.currentTime += 0.04;
    const callback = callbacks.values().next().value;
    callbacks.clear();
    callback?.(time, {} as VideoFrameCallbackMetadata);
    await flush();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    time = 0;
    callbacks = new Map();
    let sequence = 0;
    video = document.createElement("video");
    video.play = vi.fn().mockResolvedValue(undefined);
    video.pause = vi.fn();
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 4 },
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    });
    video.requestVideoFrameCallback = vi.fn(callback => { callbacks.set(++sequence, callback); return sequence; });
    video.cancelVideoFrameCallback = vi.fn(id => { callbacks.delete(id); });
    stopTrack = vi.fn();
    track = Object.assign(new EventTarget(), { stop: stopTrack });
    stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    backend = { name: "worker-gpu", detect: vi.fn().mockResolvedValue(detection({ label: "Left", x: 0.2 })), dispose: vi.fn() };
    getUserMedia = vi.fn().mockResolvedValue(stream);
    fallback = vi.fn().mockResolvedValue({ name: "main-cpu", detect: vi.fn().mockResolvedValue(detection({ label: "Left", x: 0.2 })), dispose: vi.fn() });
    onState.mockClear();
    controller = new TrackingController(video, snapshot, diagnostics, onState, {
      getUserMedia, createBackend: vi.fn().mockResolvedValue(backend), createFallback: fallback, now: () => time,
    });
  });
  afterEach(() => { controller.stop(false); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("requests video only and cleans up camera, detector, callbacks, refs and diagnostics", async () => {
    await controller.start(); await tick();
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false, video: { facingMode: "user", frameRate: { ideal: 30 } } });
    expect(snapshot.current.left?.handedness).toBe("Left");
    expect(onState.mock.calls).toHaveLength(2); // starting + running, no per-frame state
    controller.stop(); controller.stop();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(backend.dispose).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
    expect(video.srcObject).toBeNull();
    expect(snapshot.current.left).toBeNull();
    expect(diagnostics.current.processedFrames).toBe(0);
  });
  it("stops a late permission result without starting tracking", async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const starting = controller.start();
    controller.stop();
    permission.resolve(stream); await starting;
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith({ status: "idle" });
  });
  it("does not leak a backend that initializes after stop", async () => {
    const initialization = deferred<DetectionBackend>();
    controller = new TrackingController(video, snapshot, diagnostics, onState, {
      getUserMedia, createBackend: () => initialization.promise, now: () => time,
    });
    const starting = controller.start(); await flush();
    controller.stop(); initialization.resolve(backend); await starting;
    expect(backend.dispose).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
  it("rejects late inference from a stopped session", async () => {
    const result = deferred<ReturnType<typeof detection>>();
    vi.mocked(backend.detect).mockReturnValue(result.promise);
    await controller.start(); await tick(); controller.stop();
    result.resolve(detection({ label: "Left", x: 0.7 })); await flush();
    expect(snapshot.current.left).toBeNull();
    expect(diagnostics.current.processedFrames).toBe(0);
  });
  it("applies backpressure and never processes the same video frame twice", async () => {
    const result = deferred<ReturnType<typeof detection>>();
    vi.mocked(backend.detect).mockReturnValue(result.promise);
    await controller.start(); await tick(); await tick(); await tick();
    expect(backend.detect).toHaveBeenCalledTimes(1);
    result.resolve(detection()); await flush();
    const callback = callbacks.values().next().value!; callbacks.clear();
    callback(time, {} as VideoFrameCallbackMetadata); await flush();
    expect(backend.detect).toHaveBeenCalledTimes(2); // newest frame replaces skipped frames
    const again = callbacks.values().next().value!; callbacks.clear();
    again(time + 40, {} as VideoFrameCallbackMetadata); await flush();
    expect(backend.detect).toHaveBeenCalledTimes(2);
  });
  it("falls back once after worker inference failure", async () => {
    vi.mocked(backend.detect).mockRejectedValue(new Error("Worker died"));
    await controller.start(); await tick();
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(backend.dispose).toHaveBeenCalledTimes(1);
    expect(diagnostics.current.backend).toBe("main-cpu");
    await tick();
    expect(snapshot.current.left).not.toBeNull();
  });
  it("releases the camera when both worker and fallback fail", async () => {
    vi.mocked(backend.detect).mockRejectedValue(new Error("Worker died"));
    fallback.mockRejectedValue(new Error("Local model unavailable. Prepare assets and retry."));
    await controller.start(); await tick();
    expect(stopTrack).toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith({ status: "error", message: "Local model unavailable. Prepare assets and retry." });
  });
  it("pauses background processing and ignores results from before a visibility change", async () => {
    const result = deferred<ReturnType<typeof detection>>();
    vi.mocked(backend.detect).mockReturnValue(result.promise);
    await controller.start(); await tick();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(callbacks.size).toBe(0);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    result.resolve(detection({ label: "Left", x: 0.2 })); await flush();
    expect(snapshot.current.left).toBeNull();
    expect(onState).toHaveBeenLastCalledWith({ status: "running" });
  });
  it("expires stalled observations and FPS without new video frames", async () => {
    await controller.start(); await tick();
    time += 1100; await vi.advanceTimersByTimeAsync(1100);
    expect(snapshot.current.left).toBeNull();
    expect(diagnostics.current.trackingFps).toBe(0);
  });
  it("uses deduplicated animation callbacks when video frame callbacks are unavailable", async () => {
    Object.defineProperty(video, "requestVideoFrameCallback", { configurable: true, value: undefined });
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callbacks.set(++id, callback as VideoFrameRequestCallback);
      return id;
    }));
    const cancel = vi.fn((callbackId: number) => callbacks.delete(callbackId));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    await controller.start(); await tick();
    expect(backend.detect).toHaveBeenCalledTimes(1);
    const next = callbacks.values().next().value!; callbacks.clear();
    time += 40; next(time, {} as VideoFrameCallbackMetadata); await flush();
    expect(backend.detect).toHaveBeenCalledTimes(1);
    controller.stop(); expect(cancel).toHaveBeenCalled();
  });
  it("handles disconnect, playback failure, and restart without leaking tracks", async () => {
    await controller.start(); track.dispatchEvent(new Event("ended"));
    expect(onState).toHaveBeenLastCalledWith({ status: "error", message: "Camera disconnected. Reconnect it and retry." });
    vi.mocked(video.play).mockRejectedValueOnce(new Error("Playback failed"));
    await controller.start();
    expect(onState).toHaveBeenLastCalledWith({ status: "error", message: "Playback failed" });
    await controller.start();
    expect(onState).toHaveBeenLastCalledWith({ status: "running" });
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });
  it("reports permission failures and unsupported contexts", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await controller.start();
    expect(onState.mock.lastCall?.[0].message).toMatch(/permission was denied/);
    vi.stubGlobal("isSecureContext", false); await controller.start();
    expect(onState.mock.lastCall?.[0].message).toMatch(/HTTPS or localhost/);
    expect(cameraErrorMessage(new DOMException("", "NotFoundError"))).toMatch(/No camera/);
    expect(cameraErrorMessage(new DOMException("", "NotReadableError"))).toMatch(/busy/);
  });
});
