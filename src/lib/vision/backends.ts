import { ASSET_ROOT, createLandmarker } from "./landmarker";
import type { DetectionBackend, DetectionResult, WorkerRequest, WorkerResponse } from "./types";

export const INITIALIZATION_TIMEOUT_MS = 15_000;
export const INFERENCE_TIMEOUT_MS = 2_000;

export function abortError() { return new DOMException("Tracking stopped.", "AbortError"); }

/** Some browsers can stall during capture, before a frame ever reaches the worker. */
function captureBitmap(video: HTMLVideoElement, signal: AbortSignal): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancelled); };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true; cleanup(); reject(error);
    };
    const cancelled = () => fail(abortError());
    const timer = setTimeout(() => fail(new Error("Camera frame capture timed out.")), INFERENCE_TIMEOUT_MS);
    signal.addEventListener("abort", cancelled, { once: true });
    if (signal.aborted) { cancelled(); return; }
    let capture: Promise<ImageBitmap>;
    try { capture = createImageBitmap(video); }
    catch (error) { fail(error); return; }
    capture.then(bitmap => {
      if (finished) { bitmap.close(); return; }
      finished = true; cleanup(); resolve(bitmap);
    }, fail);
  });
}

/** Timeout also aborts initialization, so a late detector cannot leak. */
export async function createMainBackend(signal: AbortSignal): Promise<DetectionBackend> {
  const local = new AbortController();
  const cancel = () => local.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) local.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const created = await Promise.race([
      createLandmarker(new URL(ASSET_ROOT, location.origin).href, false, local.signal),
      new Promise<never>((_, reject) => {
        const aborted = () => reject(local.signal.reason ?? abortError());
        local.signal.addEventListener("abort", aborted, { once: true });
        if (local.signal.aborted) aborted();
        timer = setTimeout(() => local.abort(new Error("Model initialization timed out. Check local vision assets and retry.")), INITIALIZATION_TIMEOUT_MS);
      }),
    ]);
    let disposed = false;
    return {
      name: `main-${created.delegate.toLowerCase()}`,
      async detect(video, tMs) {
        if (disposed || signal.aborted) throw abortError();
        const result = created.detector.detectForVideo(video, tMs);
        return { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, handedness: result.handedness };
      },
      dispose() { if (!disposed) { disposed = true; created.detector.close(); } },
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export function createWorkerBackend(signal: AbortSignal): Promise<DetectionBackend> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/hand-tracking.worker.ts", import.meta.url));
    let disposed = false;
    let ready = false;
    let sequence = 0;
    let detecting = false;
    let pending: { id: number; resolve(result: DetectionResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
    const send = (message: WorkerRequest, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(initTimer);
      if (pending) { clearTimeout(pending.timer); pending.reject(abortError()); pending = undefined; }
      signal.removeEventListener("abort", cancelled);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (!ready) reject(error);
      if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined; }
      dispose();
    };
    const cancelled = () => { reject(abortError()); dispose(); };
    const initTimer = setTimeout(() => fail(new Error("Worker initialization timed out.")), INITIALIZATION_TIMEOUT_MS);
    signal.addEventListener("abort", cancelled, { once: true });
    worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || "Tracking worker failed.")); };
    worker.onmessageerror = () => fail(new Error("Tracking worker returned unreadable data."));
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (disposed) return;
      if (data.type === "error") { fail(new Error(data.message)); return; }
      if (data.type === "ready" && !ready) {
        ready = true;
        clearTimeout(initTimer);
        resolve({
          name: `worker-${data.delegate.toLowerCase()}`,
          async detect(video, tMs) {
            if (disposed || signal.aborted) throw abortError();
            if (detecting) throw new Error("Only one frame may be in flight.");
            detecting = true;
            try {
              const bitmap = await captureBitmap(video, signal);
              if (disposed || signal.aborted) {
                bitmap.close();
                throw abortError();
              }
              return await new Promise<DetectionResult>((frameResolve, frameReject) => {
                const id = ++sequence;
                pending = {
                  id,
                  resolve: frameResolve,
                  reject: frameReject,
                  timer: setTimeout(() => fail(new Error("Tracking worker stopped responding.")), INFERENCE_TIMEOUT_MS),
                };
                try {
                  send({ type: "frame", id, tMs, bitmap }, [bitmap]);
                } catch (error) {
                  bitmap.close();
                  fail(error instanceof Error ? error : new Error("Frame transfer failed."));
                }
              });
            } finally {
              detecting = false;
            }
          },
          dispose,
        });
      } else if (data.type === "result" && pending?.id === data.id) {
        clearTimeout(pending.timer);
        pending.resolve(data.result);
        pending = undefined;
      }
    };
    if (signal.aborted) { cancelled(); return; }
    try { send({ type: "init", assetRoot: new URL(ASSET_ROOT, location.origin).href }); }
    catch (error) { fail(error instanceof Error ? error : new Error("Worker initialization failed.")); }
  });
}

export async function createBestBackend(signal: AbortSignal): Promise<DetectionBackend> {
  let fallbackReason = "Worker, bitmap transfer, or OffscreenCanvas is unavailable.";
  if (typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try { return await createWorkerBackend(signal); }
    catch (error) { signal.throwIfAborted(); fallbackReason = error instanceof Error ? error.message : "Worker initialization failed."; }
  }
  const backend = await createMainBackend(signal);
  return { ...backend, fallbackReason };
}
