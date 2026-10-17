import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBestBackend, createMainBackend, createWorkerBackend, INITIALIZATION_TIMEOUT_MS, INFERENCE_TIMEOUT_MS } from "@/lib/vision/backends";
import { createLandmarker } from "@/lib/vision/landmarker";
import type { WorkerRequest, WorkerResponse } from "@/lib/vision/types";
import { deferred, detection } from "../fixtures/vision";

vi.mock("@/lib/vision/landmarker", () => ({ ASSET_ROOT: "/mediapipe", createLandmarker: vi.fn() }));

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  messages: WorkerRequest[] = [];
  constructor() { FakeWorker.latest = this; }
  postMessage(message: WorkerRequest) { this.messages.push(message); }
  receive(data: WorkerResponse) { this.onmessage?.({ data } as MessageEvent<WorkerResponse>); }
}

describe("vision backends", () => {
  let abort: AbortController;
  beforeEach(() => {
    vi.useFakeTimers();
    abort = new AbortController();
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("OffscreenCanvas", class {});
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close: vi.fn() }));
  });
  afterEach(() => { abort.abort(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  const video = document.createElement("video");
  const ready = async () => {
    const starting = createWorkerBackend(abort.signal);
    FakeWorker.latest.receive({ type: "ready", delegate: "GPU" });
    return starting;
  };

  it("transfers frames, correlates results, and terminates on dispose", async () => {
    const backend = await ready();
    const result = backend.detect(video, 100);
    await Promise.resolve(); await Promise.resolve();
    const request = FakeWorker.latest.messages.find(message => message.type === "frame")!;
    expect(request.type).toBe("frame");
    if (request.type !== "frame") throw new Error("missing frame");
    FakeWorker.latest.receive({ type: "result", id: request.id + 1, result: detection() });
    FakeWorker.latest.receive({ type: "result", id: request.id, result: detection({ label: "Left", x: 0.2 }) });
    expect((await result).landmarks).toHaveLength(1);
    backend.dispose(); backend.dispose();
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
  });
  it("rejects stalled worker inference and shuts down the worker", async () => {
    const backend = await ready();
    const result = backend.detect(video, 100);
    const failed = expect(result).rejects.toThrow(/stopped responding/);
    await vi.advanceTimersByTimeAsync(INFERENCE_TIMEOUT_MS);
    await failed;
    expect(FakeWorker.latest.terminate).toHaveBeenCalled();
  });
  it("bounds bitmap capture and closes a bitmap arriving after cancellation", async () => {
    const backend = await ready();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const capture = deferred<ImageBitmap>();
    vi.mocked(createImageBitmap).mockReturnValue(capture.promise);
    const result = backend.detect(video, 100);
    const failed = expect(result).rejects.toThrow(/capture timed out/);
    await vi.advanceTimersByTimeAsync(INFERENCE_TIMEOUT_MS);
    await failed;
    capture.resolve(bitmap); await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    backend.dispose();
  });
  it("prevents overlapping capture and cancels a pending capture on stop", async () => {
    const backend = await ready();
    const capture = deferred<ImageBitmap>();
    vi.mocked(createImageBitmap).mockReturnValue(capture.promise);
    const first = backend.detect(video, 100);
    const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(backend.detect(video, 101)).rejects.toThrow(/one frame/);
    abort.abort(); await cancelled;
    expect(vi.getTimerCount()).toBe(0);
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    capture.resolve(bitmap); await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
  it("cleans up capture timers when createImageBitmap throws synchronously", async () => {
    const backend = await ready();
    vi.mocked(createImageBitmap).mockImplementation(() => { throw new Error("Cannot capture video"); });
    await expect(backend.detect(video, 100)).rejects.toThrow(/Cannot capture/);
    expect(vi.getTimerCount()).toBe(0);
    backend.dispose();
  });
  it("cancels permission-independent worker initialization immediately", async () => {
    const starting = createWorkerBackend(abort.signal);
    const failed = expect(starting).rejects.toMatchObject({ name: "AbortError" });
    abort.abort(); await failed;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
  });
  it("falls back to the main backend when worker initialization fails", async () => {
    const detector = { detectForVideo: vi.fn(), close: vi.fn() };
    vi.mocked(createLandmarker).mockResolvedValue({ detector, delegate: "CPU" } as unknown as Awaited<ReturnType<typeof createLandmarker>>);
    const starting = createBestBackend(abort.signal);
    FakeWorker.latest.receive({ type: "error", message: "Worker cannot initialize" });
    const backend = await starting;
    expect(backend.name).toBe("main-cpu");
    backend.dispose();
    expect(detector.close).toHaveBeenCalledTimes(1);
  });
  it("bounds main initialization and aborts its late resource creation", async () => {
    const initialization = deferred<Awaited<ReturnType<typeof createLandmarker>>>();
    vi.mocked(createLandmarker).mockReturnValue(initialization.promise);
    const starting = createMainBackend(abort.signal);
    const failed = expect(starting).rejects.toThrow(/initialization timed out/);
    await vi.advanceTimersByTimeAsync(INITIALIZATION_TIMEOUT_MS); await failed;
    const signal = vi.mocked(createLandmarker).mock.calls.at(-1)![2]!;
    expect(signal.aborted).toBe(true);
  });
  it("handles unreadable worker messages and initialization timeouts", async () => {
    const starting = createWorkerBackend(abort.signal);
    const failed = expect(starting).rejects.toThrow(/unreadable/);
    FakeWorker.latest.onmessageerror?.(); await failed;
    const again = createWorkerBackend(abort.signal);
    const timedOut = expect(again).rejects.toThrow(/initialization timed out/);
    await vi.advanceTimersByTimeAsync(INITIALIZATION_TIMEOUT_MS); await timedOut;
  });
});
