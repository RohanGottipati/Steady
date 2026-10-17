import { pegTransferSkill } from "@/data/skills/peg-transfer";
import type { SkillDefinition, Vec3 } from "@/types";

export const PEG_ID = "practice-peg";

export const PEG_SEGMENT_IDS = [
  "reach",
  "grasp",
  "lift",
  "transfer",
  "place",
  "release",
  "complete",
] as const;

export type PegSegmentId = (typeof PEG_SEGMENT_IDS)[number];

export interface PegPostConfig {
  id: "source-post" | "target-post";
  label: string;
  position: Readonly<Vec3>;
}

export interface PegZoneConfig {
  id: "transfer-zone";
  label: string;
  position: Readonly<Vec3>;
}

export interface PegDangerZoneConfig {
  id: "board-edge";
  label: string;
  center: Readonly<Vec3>;
  halfExtents: Readonly<Vec3>;
}

/** Scene-plane home of the peg. Matches the grasp tip of the synthetic reference with Z projected to the assisted working plane. */
export const PEG_HOME: Readonly<Vec3> = { x: -0.225, y: 0.2, z: 0 };

export const SOURCE_POST: Readonly<PegPostConfig> = {
  id: "source-post",
  label: "Left post",
  position: PEG_HOME,
};

export const TRANSFER_ZONE: Readonly<PegZoneConfig> = {
  id: "transfer-zone",
  label: "Midline transfer",
  position: { x: 0, y: 0.34, z: 0 },
};

export const TARGET_POST: Readonly<PegPostConfig> = {
  id: "target-post",
  label: "Right post",
  position: { x: 0.25, y: 0.19, z: 0 },
};

export const BOARD_EDGE_ZONE: Readonly<PegDangerZoneConfig> = {
  id: "board-edge",
  label: "Board edge",
  center: { x: 0, y: 0.02, z: 0 },
  halfExtents: { x: 0.42, y: 0.05, z: 0.14 },
};

export const PEG_TRANSFER_THRESHOLDS = {
  reachRadius: 0.2,
  graspRadius: 0.18,
  liftClearance: 0.1,
  transferRadius: 0.1,
  assistMeetRadius: 0.14,
  placeRadius: 0.1,
  placeHeightSlack: 0.05,
  corridorToleranceUnits: 0.14,
  sustainedDeviationMs: 1600,
  demonstrationDurationMs: 3000,
  maxRecordedFrames: 18_000,
} as const;

/** Polyline through the synthetic left-tool transfer, flattened onto Z = 0. */
export const PEG_CORRIDOR: readonly Vec3[] = [
  { x: PEG_HOME.x, y: PEG_HOME.y, z: 0 },
  { x: -0.133, y: 0.307, z: 0 },
  { x: TRANSFER_ZONE.position.x, y: TRANSFER_ZONE.position.y, z: 0 },
  { x: 0.2, y: 0.247, z: 0 },
  { x: TARGET_POST.position.x, y: TARGET_POST.position.y, z: 0 },
];

const NEEDLE_SEGMENT_IDS = new Set([
  "approach",
  "grip",
  "align",
  "entry",
  "rotation",
  "exit",
]);

export function validatePegTransferSceneConfig(skill: SkillDefinition = pegTransferSkill) {
  if (skill.id !== "peg-transfer") {
    throw new Error(`Unsupported skill configuration: ${skill.id}`);
  }
  if (skill.segments.map(segment => segment.id).join(",") !== PEG_SEGMENT_IDS.join(",")) {
    throw new Error(`Peg Transfer segments must be ${PEG_SEGMENT_IDS.join(",")}`);
  }
  if (skill.segments.some(segment => NEEDLE_SEGMENT_IDS.has(segment.id))) {
    throw new Error("Peg Transfer must not reuse Needle Passing segment ids");
  }
  if (skill.sceneConfig.sceneId !== "peg-transfer-scene") {
    throw new Error(`Unexpected peg scene id: ${skill.sceneConfig.sceneId}`);
  }
  if (skill.sceneConfig.targetIds.join(",") !== "source-post,transfer-zone,target-post") {
    throw new Error("Peg Transfer targetIds must be source-post, transfer-zone, target-post");
  }
  if (!skill.sceneConfig.dangerZoneIds.includes(BOARD_EDGE_ZONE.id)) {
    throw new Error(`Skill dangerZoneIds missing ${BOARD_EDGE_ZONE.id}`);
  }
  if (skill.referenceMotionId !== "peg-transfer-reference-v1") {
    throw new Error(`Unexpected peg reference id: ${skill.referenceMotionId}`);
  }
  return skill;
}

export function pegLiftHeight(): number {
  return PEG_HOME.y + PEG_TRANSFER_THRESHOLDS.liftClearance;
}

export function pegTargetPosition(activeTargetId: string | null): Vec3 | null {
  if (activeTargetId === PEG_ID || activeTargetId === SOURCE_POST.id) return { ...SOURCE_POST.position };
  if (activeTargetId === TRANSFER_ZONE.id) return { ...TRANSFER_ZONE.position };
  if (activeTargetId === TARGET_POST.id) return { ...TARGET_POST.position };
  return null;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pointSegmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const abz = end.z - start.z;
  const lengthSq = abx * abx + aby * aby + abz * abz;
  if (lengthSq < 1e-8) return distance(point, start);
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * abx + (point.y - start.y) * aby + (point.z - start.z) * abz) / lengthSq));
  return distance(point, { x: start.x + abx * t, y: start.y + aby * t, z: start.z + abz * t });
}

export function pegCorridorDeviation(point: Vec3): number {
  let best = Infinity;
  for (let index = 0; index < PEG_CORRIDOR.length - 1; index++) {
    best = Math.min(best, pointSegmentDistance(point, PEG_CORRIDOR[index], PEG_CORRIDOR[index + 1]));
  }
  return best;
}
