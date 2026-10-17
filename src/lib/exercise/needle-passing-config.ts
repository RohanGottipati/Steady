import { needlePassingSkill } from "@/data/skills/needle-passing";
import { NEEDLE_ID } from "@/lib/simulation/tool-simulation";
import type { Quat, SkillDefinition, Vec3 } from "@/types";

export type TargetRingId = "ring-1" | "ring-2" | "ring-3";
export type DangerZoneId = "tissue-wall";
export type ActiveTargetId = typeof NEEDLE_ID | TargetRingId | "release-zone" | null;

export interface TargetRingConfig {
  id: TargetRingId;
  label: string;
  position: Readonly<Vec3>;
  tiltRad: number;
  alignRadius: { assisted: number; free: number };
  gateRadius: { assisted: number; free: number };
}

export interface ReleaseZoneConfig {
  id: "release-zone";
  label: string;
  position: Readonly<Vec3>;
  radius: { assisted: number; free: number };
}

export interface DangerZoneBoxConfig {
  id: DangerZoneId;
  label: string;
  center: Readonly<Vec3>;
  halfExtents: Readonly<Vec3>;
}

export const NEEDLE_PASSING_RINGS: readonly TargetRingConfig[] = [
  {
    id: "ring-1",
    label: "Entry ring 1",
    position: { x: -0.16, y: 0.24, z: 0 },
    tiltRad: -0.25,
    alignRadius: { assisted: 0.15, free: 0.13 },
    gateRadius: { assisted: 0.11, free: 0.08 },
  },
  {
    id: "ring-2",
    label: "Apex ring 2",
    position: { x: 0, y: 0.18, z: 0 },
    tiltRad: 0,
    alignRadius: { assisted: 0.13, free: 0.11 },
    gateRadius: { assisted: 0.11, free: 0.08 },
  },
  {
    id: "ring-3",
    label: "Exit ring 3",
    position: { x: 0.16, y: 0.24, z: 0 },
    tiltRad: 0.25,
    alignRadius: { assisted: 0.13, free: 0.11 },
    gateRadius: { assisted: 0.11, free: 0.08 },
  },
] as const;

export const RELEASE_ZONE: Readonly<ReleaseZoneConfig> = {
  id: "release-zone",
  label: "Release zone",
  position: { x: 0.2, y: 0.36, z: 0 },
  radius: { assisted: 0.1, free: 0.08 },
};

export const TISSUE_WALL_ZONE: Readonly<DangerZoneBoxConfig> = {
  id: "tissue-wall",
  label: "Tissue wall",
  center: { x: 0, y: 0.01, z: 0 },
  halfExtents: { x: 0.35, y: 0.06, z: 0.12 },
};

export const EXERCISE_THRESHOLDS = {
  approachRadius: 0.24,
  entryOrientationToleranceDeg: 45,
  requiredRotationDeltaDeg: 12,
  corridorToleranceUnits: 0.12,
  sustainedDeviationMs: 1500,
  demonstrationDurationMs: 3000,
  maxRecordedFrames: 18_000,
} as const;

export const ENTRY_TARGET_ROTATION: Readonly<Quat> = { x: 0, y: 0, z: 0, w: 1 };

export function validateSkillSceneConfig(skill: SkillDefinition = needlePassingSkill) {
  const ringIds = NEEDLE_PASSING_RINGS.map(ring => ring.id);
  if (skill.id !== "needle-passing" || skill.segments.length < 2) {
    throw new Error(`Unsupported skill configuration: ${skill.id}`);
  }
  if (skill.sceneConfig.targetIds.join(",") !== ringIds.join(",")) {
    throw new Error(`Skill targetIds mismatch: expected ${ringIds.join(",")}`);
  }
  if (!skill.sceneConfig.dangerZoneIds.includes(TISSUE_WALL_ZONE.id)) {
    throw new Error(`Skill dangerZoneIds missing ${TISSUE_WALL_ZONE.id}`);
  }
  return skill;
}

export function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function quatAngleDegrees(a: Quat, b: Quat): number {
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return 2 * Math.acos(dot) * (180 / Math.PI);
}

export function pointInBox(point: Vec3, box: { center: Readonly<Vec3>; halfExtents: Readonly<Vec3> }): boolean {
  return (
    Math.abs(point.x - box.center.x) <= box.halfExtents.x + 1e-9 &&
    Math.abs(point.y - box.center.y) <= box.halfExtents.y + 1e-9 &&
    Math.abs(point.z - box.center.z) <= box.halfExtents.z + 1e-9
  );
}

/** Exact quadratic curve through ring-1 (-0.16, 0.24, 0), ring-2 (0, 0.18, 0), and ring-3 (0.16, 0.24, 0). */
export function corridorArcPoint(u: number): Vec3 {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0));
  const centered = clamped - 0.5;
  return {
    x: -0.16 + 0.32 * clamped,
    y: 0.18 + 0.24 * centered * centered,
    z: 0,
  };
}

export function corridorMetrics(point: Vec3): { u: number; closestPoint: Vec3; deviation: number } {
  const rawU = Math.min(1, Math.max(0, (point.x + 0.16) / 0.32));
  let bestU = rawU;
  let bestPoint = corridorArcPoint(rawU);
  let bestDistance = pointDistance(point, bestPoint);
  for (let step = 0; step <= 32; step++) {
    const candidateU = step / 32;
    const candidatePoint = corridorArcPoint(candidateU);
    const distance = pointDistance(point, candidatePoint);
    if (distance < bestDistance) {
      bestU = candidateU;
      bestPoint = candidatePoint;
      bestDistance = distance;
    }
  }
  return { u: bestU, closestPoint: bestPoint, deviation: bestDistance };
}
