import { createBestBackend, createMainBackend } from "./backends";
import { HandIdentityTracker } from "./hand-identity";
import { emptySnapshot, type DetectionBackend, type MutableValue, type TrackingDiagnostics, type TrackingSnapshot, type TrackingState } from "./types";

export interface TrackingDependencies {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createBackend(signal: AbortSignal): Promise<DetectionBackend>;
  createFallback(signal: AbortSignal): Promise<DetectionBackend>;
  now(): number;
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError": return "Camera permission was denied. Allow camera access in browser settings and retry.";
      case "NotFoundError": return "No camera was found. Connect a camera and retry.";
      case "NotReadableError": return "The camera is unavailable or busy. Close other camera apps and retry.";
      case "OverconstrainedError": return "The camera cannot satisfy the requested settings. Try another camera.";
    }
  }
  return error instanceof Error ? error.message : "Camera tracking failed. Stop and retry.";
}

export class TrackingController {
  private session = 0;
  private abort?: AbortController;
  private stream?: MediaStream;
  private backend?: DetectionBackend;
  private callback?: number;
  private callbackKind: "video" | "animation" = "animation";
  private lastMediaTime = -1;
  private lastInference = -Infinity;
  private lastTimestamp = -Infinity;
  private busy = false;
  private fallbackUsed = false;
  private running = false;
  private visibilityEpoch = 0;
  private frames: number[] = [];
  private tracker = new HandIdentityTracker();
  private cleanupListeners: (() => void)[] = [];
  private readonly deps: TrackingDependencies;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly snapshot: MutableValue<TrackingSnapshot>,
    private readonly diagnostics: MutableValue<TrackingDiagnostics>,
    private readonly onState: (state: TrackingState) => void,
    dependencies: Partial<TrackingDependencies> = {},
  ) {
    this.deps = {
      getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
      createBackend: createBestBackend,
      createFallback: createMainBackend,
      now: () => performance.now(),
      ...dependencies,
    };
  }

  async start() {
    this.stop(false);
    const session = this.session;
    const abort = this.abort = new AbortController();
    this.onState({ status: "starting" });
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires a supported browser on HTTPS or localhost.");
      }
      const stream = await this.deps.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
      if (session !== this.session) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const ended = () => this.fail(session, new Error("Camera disconnected. Reconnect it and retry."));
      stream.getVideoTracks().forEach(track => {
        track.addEventListener("ended", ended);
        this.cleanupListeners.push(() => track.removeEventListener("ended", ended));
      });
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      if (session !== this.session) return;
      const backend = await this.deps.createBackend(abort.signal);
      if (session !== this.session) { backend.dispose(); return; }
      this.backend = backend;
      this.diagnostics.current.backend = backend.name;
      this.diagnostics.current.fallbackReason = backend.fallbackReason;
      this.running = true;
      const watchdog = setInterval(() => {
        const now = this.deps.now();
        if (now - this.snapshot.current.tMs > 500) this.snapshot.current = emptySnapshot(now);
        this.frames = this.frames.filter(t => now - t < 1000);
        this.diagnostics.current.trackingFps = this.frames.length;
      }, 250);
      this.cleanupListeners.push(() => clearInterval(watchdog));
      const visibility = () => {
        if (!this.running) return;
        this.cancelScheduledFrame();
        ++this.visibilityEpoch;
        this.snapshot.current = emptySnapshot(this.deps.now());
        this.frames = [];
        this.diagnostics.current.trackingFps = 0;
        this.tracker.reset();
        this.onState({ status: document.hidden ? "paused" : "running" });
        if (!document.hidden) this.schedule(session);
      };
      document.addEventListener("visibilitychange", visibility);
      this.cleanupListeners.push(() => document.removeEventListener("visibilitychange", visibility));
      visibility();
    } catch (error) { if (session === this.session) this.fail(session, error); }
  }

  stop(notify = true) {
    ++this.session;
    this.running = false;
    ++this.visibilityEpoch;
    this.abort?.abort();
    this.abort = undefined;
    this.cancelScheduledFrame();
    this.cleanupListeners.splice(0).forEach(cleanup => cleanup());
    this.backend?.dispose();
    this.backend = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
    this.snapshot.current = emptySnapshot(this.deps.now());
    this.diagnostics.current = { backend: "none", trackingFps: 0, inferenceMs: 0, processedFrames: 0 };
    this.tracker.reset();
    this.busy = false;
    this.fallbackUsed = false;
    this.lastMediaTime = -1;
    this.lastInference = -Infinity;
    this.lastTimestamp = -Infinity;
    this.frames = [];
    if (notify) this.onState({ status: "idle" });
  }

  private fail(session: number, error: unknown) {
    if (session !== this.session) return;
    this.stop(false);
    this.onState({ status: "error", message: cameraErrorMessage(error) });
  }

  private cancelScheduledFrame() {
    if (this.callback === undefined) return;
    if (this.callbackKind === "video") this.video.cancelVideoFrameCallback(this.callback);
    else cancelAnimationFrame(this.callback);
    this.callback = undefined;
  }

  private schedule(session: number) {
    if (session !== this.session || !this.running || document.hidden) return;
    const callback = () => {
      this.callback = undefined;
      if (session !== this.session) return;
      this.schedule(session);
      void this.processFrame(session);
    };
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.callbackKind = "video";
      this.callback = this.video.requestVideoFrameCallback(callback);
    } else {
      this.callbackKind = "animation";
      this.callback = requestAnimationFrame(callback);
    }
  }

  private async processFrame(session: number) {
    const now = this.deps.now();
    if (!this.backend || !this.running || this.busy || document.hidden || this.video.readyState < 2 ||
      !this.video.videoWidth || !this.video.videoHeight ||
      this.video.currentTime === this.lastMediaTime || now - this.lastInference < 1000 / 30 - 0.5) return;
    this.busy = true;
    this.lastInference = now;
    this.lastMediaTime = this.video.currentTime;
    const tMs = Math.max(now, this.lastTimestamp + 0.001);
    const visibilityEpoch = this.visibilityEpoch;
    this.lastTimestamp = tMs;
    try {
      const result = await this.backend.detect(this.video, tMs);
      if (session !== this.session || document.hidden || visibilityEpoch !== this.visibilityEpoch) return;
      this.snapshot.current = this.tracker.update(result, tMs);
      const finished = this.deps.now();
      this.frames.push(finished);
      this.frames = this.frames.filter(t => finished - t < 1000);
      this.diagnostics.current = {
        backend: this.backend.name, trackingFps: this.frames.length,
        fallbackReason: this.diagnostics.current.fallbackReason,
        inferenceMs: finished - now, processedFrames: this.diagnostics.current.processedFrames + 1,
      };
    } catch (error) {
      if (session !== this.session) return;
      if (!this.fallbackUsed && this.backend.name.startsWith("worker")) {
        this.fallbackUsed = true;
        this.backend.dispose();
        this.snapshot.current = emptySnapshot(this.deps.now());
        this.onState({ status: "starting", message: "Switching to local fallback tracking…" });
        try {
          const fallback = await this.deps.createFallback(this.abort!.signal);
          if (session !== this.session) { fallback.dispose(); return; }
          this.backend = fallback;
          this.tracker.reset();
          this.frames = [];
          this.diagnostics.current.backend = fallback.name;
          this.diagnostics.current.fallbackReason = cameraErrorMessage(error);
          this.onState({ status: document.hidden ? "paused" : "running" });
        } catch (fallbackError) { this.fail(session, fallbackError); }
      } else this.fail(session, error);
    } finally { if (session === this.session) this.busy = false; }
  }
}
