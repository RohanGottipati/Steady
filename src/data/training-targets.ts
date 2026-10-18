/**
 * Exercise → visual training-target mapping and target transforms.
 *
 * All values are TRAINING-LOCAL (the canonical space of needle-passing-config.ts / peg-transfer-config.ts):
 * +X = surgeon's right, +Y = away from the surgeon, +Z = up toward the camera; the canonical working plane is Z = 0.
 * Targets are purely visual and sit around (mostly just below) that plane; they never move checkpoints,
 * collision zones, ghost references, tool mapping, scoring or replay coordinates.
 */
import type { Triple } from "@/data/scene-layout";

export type TrainingTargetKind =
  | "synthetic-tissue-pad"
  | "tissue-knot-trainer"
  | "peg-transfer-board"
  | "surgical-anatomy"
  | "fallback";

/** Undefined resolves to the needle-passing pad because scenes without an exercise render needle-passing targets. */
export function trainingTargetKind(skillId?: string): TrainingTargetKind {
  switch (skillId ?? "needle-passing") {
    case "needle-passing":
    case "suturing":
      return "synthetic-tissue-pad";
    case "knot-tying":
      return "tissue-knot-trainer";
    case "peg-transfer":
      return "peg-transfer-board";
    case "cholecystectomy":
      return "surgical-anatomy";
    default:
      return "fallback";
  }
}

/** Local Z of the drape top under the training field: (DRAPE_TOP_Y - TRAINING_FIELD.y) / scale ≈ -0.094. */
export const FIELD_FLOOR_Z = -0.092;

/**
 * Synthetic skin/tissue suture pad under the needle-passing rings.
 * Peak skin height stays ~0.02 below the canonical needle plane so the needle, rings and ghost path
 * remain visible above the surface.
 */
export const TISSUE_PAD = {
  center: [0, 0.17] as const,
  width: 0.8,
  depth: 0.5,
  /** Subcutaneous (fat/foam) layer thickness. */
  fatThickness: 0.03,
  /** Dermis layer thickness. */
  dermisThickness: 0.015,
  /** Raised epidermis dome height above the dermis top. */
  domeHeight: 0.02,
  /** Linear incision crossed by the Ring 1 → Ring 3 bite (at Ring 2). Absolute training-local coordinates. */
  incision: { x: 0, yStart: 0.06, yEnd: 0.3, depth: 0.012, halfWidth: 0.006 },
} as const;

export const TISSUE_PAD_SURFACE_BASE_Z = FIELD_FLOOR_Z + TISSUE_PAD.fatThickness + TISSUE_PAD.dermisThickness;

/** Laparoscopic pegboard (FLS-style) under the peg-transfer posts. */
export const PEG_BOARD = {
  tray: { center: [0, 0.2] as const, width: 1, depth: 0.66, thickness: 0.05 },
  insert: { center: [0, 0.26] as const, width: 0.86, depth: 0.44 },
  /** Decorative (non-interactive) pegs; kept clear of both posts, the transfer zone and the corridor. */
  decorativePegs: [
    [-0.37, 0.12],
    [-0.37, 0.3],
    [-0.31, 0.43],
    [-0.15, 0.44],
    [-0.12, 0.1],
    [-0.25, 0.06],
    [0.37, 0.12],
    [0.37, 0.3],
    [0.31, 0.43],
    [0.15, 0.44],
    [0.12, 0.1],
    [0.25, 0.06],
  ] as const,
} as const;

export const PEG_BOARD_TOP_Z = FIELD_FLOOR_Z + PEG_BOARD.tray.thickness + 0.002;

/** Vessel-style knot-tying target (no playable runtime yet; blueprint skill only). */
export const KNOT_TRAINER = {
  vessel: { y: 0.2, halfLength: 0.28, radius: 0.022 },
} as const;

/**
 * Licensed hepatobiliary anatomy (BodyParts3D, CC BY 4.0) for procedure modules such as a
 * future laparoscopic cholecystectomy. The GLB is authored in glTF metres with +X patient left,
 * +Y superior, +Z anterior and its origin at the gallbladder/cystic-duct junction. With the patient
 * supine and the head away from the surgeon those axes coincide with training-local axes, so no
 * rotation is required; the scale enlarges the organs to the trainer's working area.
 */
export const HEPATOBILIARY_ANATOMY = {
  url: "/models/patient/hepatobiliary-anatomy.glb",
  position: [0, 0.17, -0.06] as Triple,
  rotation: [0, 0, 0] as Triple,
  scale: 2.6,
} as const;
