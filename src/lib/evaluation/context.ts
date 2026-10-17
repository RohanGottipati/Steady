import type { Vec3 } from "@/types/geometry";
import type { MotionFrame } from "@/types/motion";
import type { AlignedSample } from "./align";
import type { RecordedMotion } from "./types";

/** A spherical danger/forbidden region in canonical scene units. */
export type DangerSphere = { center: Vec3; radius: number };

/** Axis-aligned forbidden volume, matching the authoritative exercise geometry. */
export type DangerBox = { center: Readonly<Vec3>; halfExtents: Readonly<Vec3> };

/**
 * Optional scene inputs for the safety/interaction metrics. Real danger-zone
 * geometry and tool-collision radii arrive with the A4 exercise engine; until
 * then these default to "no zones" (dangerZoneAvoidance = 100) and a fixed
 * tool-tool collision radius, so B5 completes without a contract change.
 */
export type EvaluationScene = {
  dangerZones?: DangerSphere[];
  dangerBoxes?: readonly DangerBox[];
  collisionRadius?: number;
};

/** Everything a metric function reads. Pure: metrics never mutate it. */
export type MetricContext = {
  samples: AlignedSample[];
  reference: { frames: readonly MotionFrame[]; segments: readonly { id: string }[] };
  user: RecordedMotion;
  scene: EvaluationScene;
};
