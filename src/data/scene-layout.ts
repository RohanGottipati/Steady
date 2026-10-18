/**
 * World layout for the 3D operating room.
 *
 * Convention: +X = surgeon's right, +Y = up, +Z = toward the surgeon / camera.
 * The operating table sits at the world origin (its long axis runs along Z).
 *
 * IMPORTANT: Exercise, hand-mapping, ghost and scoring math all run in TRAINING-LOCAL space
 * (the same units as needle-passing-config.ts / hand-controls.ts). The room never changes those
 * numbers — the TRAINING_FIELD transform below only places that local space onto the table.
 */
export type Triple = [number, number, number];

export const ROOM = {
  width: 13,
  depth: 12,
  height: 4,
  wall: 0.12,
  /** Room is shifted so the back wall is further away than the front wall. */
  centerZ: -0.5,
} as const;

export const ROOM_BOUNDS = {
  backZ: ROOM.centerZ - ROOM.depth / 2,
  frontZ: ROOM.centerZ + ROOM.depth / 2,
  leftX: -ROOM.width / 2,
  rightX: ROOM.width / 2,
} as const;

/** Table pedestal center along Z (table spans TABLE_CENTER_Z ± 1.85). */
export const TABLE_CENTER_Z = -0.6;
/** Top surface of the surgical drape. */
export const DRAPE_TOP_Y = 1.2075;

/**
 * Training-local → world transform.
 * Rotating -90° about X maps local +Y (screen-up in the original orthographic view) to world -Z
 * (away from the surgeon) and local +Z (palm-depth) to world +Y (up). The original front view
 * therefore becomes a top-down surgeon view without changing any training-local coordinate.
 */
export const TRAINING_FIELD = {
  position: [0, 1.32, -0.05] as Triple,
  rotation: [-Math.PI / 2, 0, 0] as Triple,
  scale: 1.2,
};

/** World point at the center of the needle-passing rings. Surgical lights aim here. */
export const FIELD_FOCUS: Triple = [0, 1.32, -0.35];

export interface CameraPreset {
  position: Triple;
  target: Triple;
  fov: number;
}

export const CAMERA_PRESETS: Record<
  "surgeon" | "wide" | "landing",
  CameraPreset
> = {
  surgeon: { position: [0, 2.2, 1.45], target: [0, 1.28, -0.5], fov: 50 },
  wide: { position: [2.6, 2.75, 3.4], target: [0, 1.25, -0.9], fov: 50 },
  landing: { position: [3.3, 2.55, 3.6], target: [-0.1, 1.3, -1.1], fov: 46 },
};

/** Replay orbit limits (radians / world units) so the user cannot get lost. */
export const REPLAY_ORBIT = {
  minDistance: 1.3,
  maxDistance: 3.6,
  minPolarAngle: 0.45,
  maxPolarAngle: 1.3,
  minAzimuthAngle: -0.85,
  maxAzimuthAngle: 0.85,
};
