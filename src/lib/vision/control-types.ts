import type { HandFrame, Quat, ToolState, Vec3 } from "@/types";

export type HandSlot = "left" | "right";
export const HAND_SLOTS: readonly HandSlot[] = ["left", "right"];
/** Build-time emergency fallback; changing modes requires fresh calibration. */
export const USE_SURGICAL_POSTURE_MAPPING = process.env.NEXT_PUBLIC_SURGICAL_POSTURE_MAPPING !== "false";
export interface VideoDimensions { width: number; height: number }
export interface HandCalibration {
  /** Unmirrored normalized image center; scale/range use image-height units. */
  neutralCenter: Vec3;
  palmScale: number;
  /** Absolute orthonormal palm basis in the canonical scene convention. */
  neutralRotation: Quat;
  openPinchRatio: number;
  closedPinchRatio: number;
  enterPinchRatio: number;
  releasePinchRatio: number;
  /** Positive travel from neutral in canonical left/right/down/up directions. */
  range: { left: number; right: number; down: number; up: number };
}
export interface CalibrationProfile {
  dimensions: VideoDimensions;
  left: HandCalibration;
  right: HandCalibration;
}
export type CalibrationStage = "idle" | "neutral" | "pinch" | "workspace" | "ready" | "error";
export const WORKSPACE_DIRECTIONS = ["left", "right", "up", "down"] as const;
export type WorkspaceDirection = typeof WORKSPACE_DIRECTIONS[number];
export type WorkspaceProgress = Record<HandSlot, Record<WorkspaceDirection, number>>;
export interface CalibrationState {
  stage: CalibrationStage; progress: number; message: string;
  workspace?: WorkspaceProgress;
  retryStage?: "workspace";
  secondsRemaining?: number;
  /** Independent neutral capture progress; memory-only, not recording metadata. */
  neutralHands?: Record<HandSlot, number>;
}
/** A3 computes instrument tips and owns held objects; A2 supplies only controls. */
export type ToolControlTarget = Pick<ToolState, "id" | "position" | "rotation" | "jawClosed">;
export interface HandControl {
  status: "unavailable" | "tracking" | "grace" | "lost" | "recovering";
  lastSeenMs: number | null;
  /** Only a usable current observation, never a held/predicted hand. */
  hand: HandFrame | null;
  target: ToolControlTarget | null;
  rotationHeld: boolean;
}
export interface ControlSnapshot {
  /** Last consumed raw source timestamp; render callbacks do not advance it. */
  sourceTMs: number | null;
  calibrated: boolean;
  canProgress: boolean;
  left: HandControl;
  right: HandControl;
}
export const emptyHandControl = (): HandControl => ({ status: "unavailable", lastSeenMs: null, hand: null, target: null, rotationHeld: false });
export const emptyControlSnapshot = (): ControlSnapshot => ({ sourceTMs: null, calibrated: false, canProgress: false, left: emptyHandControl(), right: emptyHandControl() });

export const CONTROL_TIMING = { freshnessMs: 200, recoveryFrames: 3, pinchDebounceMs: 100, maxSampleGapMs: 120 } as const;
export interface ControlMappingOptions {
  leftRest: Vec3;
  rightRest: Vec3;
  xyTravel: number;
  maxDepth: number;
  maxRotationRad: number;
}
export const DEFAULT_MAPPING: Readonly<ControlMappingOptions> = {
  leftRest: { x: -0.5, y: 0, z: 0 }, rightRest: { x: 0.5, y: 0, z: 0 },
  xyTravel: 0.75, maxDepth: 0.15, maxRotationRad: Math.PI / 2,
};
