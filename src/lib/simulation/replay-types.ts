import type { MotionFrame, ReferenceMotion, ReplayMarker, TrainingMode } from "@/types";
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
/**
 * Optional excerpt of a future B9 `AiReview`. When `replayNarration` is a
 * non-empty string, replay speaks and shows that text instead of the
 * deterministic marker sentence. S2 does not produce this with a model.
 */
export interface ReplayReviewExcerpt {
  replayNarration?: string | null;
}
/** Memory-only supplement to S1's unchanged SavedAttempt contract. */
export interface CompletedReplay {
  attemptId: string;
  source: "webcam" | "fixture";
  input: ReplayInput;
  markers: readonly ReplayMarker[];
  /** Mode of the completed attempt. Live assessment coaching stays silent elsewhere. */
  mode?: TrainingMode;
  /** B9 seam. Unset until a review payload exists. */
  review?: ReplayReviewExcerpt | null;
}
export interface ReplayNeedle extends Pose {
  heldBy: TaskObject["heldBy"];
}
