import type { Handedness, Vec3 } from "@/types";

/** Raw observations, deliberately separate from A2's calibrated HandFrame. */
export interface RawTrackedHand {
  handedness: Handedness;
  /** Classification probability of this assigned label, NOT landmark accuracy. */
  handednessConfidence: number;
  landmarks: Vec3[];
  worldLandmarks: Vec3[];
  /** Unmirrored normalized IMAGE coordinates, never world coordinates. */
  palmCenter: Vec3;
}

export interface TrackingSnapshot {
  tMs: number;
  left: RawTrackedHand | null;
  right: RawTrackedHand | null;
}

export type TrackingStatus = "idle" | "starting" | "running" | "paused" | "error";
export interface TrackingState { status: TrackingStatus; message?: string }
export interface TrackingDiagnostics {
  backend: string;
  fallbackReason?: string;
  trackingFps: number;
  inferenceMs: number;
  processedFrames: number;
}
export interface MutableValue<T> { current: T }

/** Structural SDK boundary also used by recorded/synthetic test observations. */
export interface DetectionResult {
  landmarks: Vec3[][];
  worldLandmarks: Vec3[][];
  handedness: { categoryName: string; score: number }[][];
}

export interface DetectionBackend {
  readonly name: string;
  readonly fallbackReason?: string;
  detect(video: HTMLVideoElement, tMs: number): Promise<DetectionResult>;
  dispose(): void;
}

export const emptySnapshot = (tMs = 0): TrackingSnapshot => ({ tMs, left: null, right: null });

export type WorkerRequest =
  | { type: "init"; assetRoot: string }
  | { type: "frame"; id: number; tMs: number; bitmap: ImageBitmap }
  | { type: "dispose" };
export type WorkerResponse =
  | { type: "ready"; delegate: string }
  | { type: "result"; id: number; result: DetectionResult }
  | { type: "error"; message: string };
