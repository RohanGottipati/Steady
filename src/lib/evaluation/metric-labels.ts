import type { PerformanceMetricId } from "@/types";

/** Human-readable labels for the 20 deterministic metrics (shared by the results UI and review layer). */
export const METRIC_LABELS: Record<PerformanceMetricId, string> = {
  pathSimilarity: "Path Similarity",
  targetAccuracy: "Target Accuracy",
  depthConsistency: "Depth Consistency",
  instrumentOrientationAccuracy: "Instrument Orientation Accuracy",
  movementSmoothness: "Movement Smoothness",
  pathEfficiency: "Path Efficiency",
  motionStability: "Motion Stability",
  overshootControl: "Overshoot Control",
  correctionEfficiency: "Correction Efficiency",
  rotationControlAccuracy: "Rotation Control Accuracy",
  pinchStability: "Pinch Stability",
  gripTiming: "Grip Timing",
  handWorkspaceControl: "Hand Workspace Control",
  bimanualCoordination: "Bimanual Coordination",
  segmentTiming: "Segment Timing",
  speedProfileControl: "Speed Profile Control",
  idleTimeControl: "Idle Time Control",
  toolCollisionAvoidance: "Tool Collision Avoidance",
  dangerZoneAvoidance: "Danger Zone Avoidance",
  proceduralSequencing: "Procedural Sequencing",
};

export function metricLabel(id: string): string {
  return METRIC_LABELS[id as PerformanceMetricId] ?? id;
}
