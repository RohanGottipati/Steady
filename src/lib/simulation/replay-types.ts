import type { MotionFrame, ReferenceMotion, ReplayMarker } from "@/types";
import type { Pose, TaskObject } from "./tool-simulation";

/** Aligned by index with the evaluation recording, never by render time. */
export interface ReplaySceneFrame {
  needle: TaskObject;
  visible: { left: boolean; right: boolean };
}
export interface ReplayRecording {
  skillId: string;
  frames: MotionFrame[];
  sceneFrames: ReplaySceneFrame[];
  truncated: boolean;
}
export interface ReplayInput {
  skillId: string;
  userFrames: readonly MotionFrame[];
  reference: ReferenceMotion;
  sceneFrames?: readonly ReplaySceneFrame[];
  truncated?: boolean;
}
/** Memory-only supplement to S1's unchanged SavedAttempt contract. */
export interface CompletedReplay {
  attemptId: string;
  source: "webcam" | "fixture";
  input: ReplayInput;
  markers: readonly ReplayMarker[];
}
export interface ReplayNeedle extends Pose {
  heldBy: TaskObject["heldBy"];
}
