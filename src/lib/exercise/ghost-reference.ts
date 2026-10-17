import { Quaternion, Vector3 } from "three";
import needlePassingReferenceJson from "../../../public/references/needle-passing/needle-passing-reference-v1.json";
import { parseReference } from "@/lib/references/load-reference";
import { NEEDLE_ID, TIP_OFFSET, type Pose } from "@/lib/simulation/tool-simulation";
import { COORDINATE_SYSTEM, DATA_SCHEMA_VERSION, type MotionFrame, type NeedlePassingSegment, type Quat, type ReferenceMotion, type ToolState, type Vec3 } from "@/types";
import { corridorArcPoint, NEEDLE_PASSING_RINGS, RELEASE_ZONE, TISSUE_WALL_ZONE } from "./needle-passing-config";

export type GhostReferenceSourceId = "synthetic-v1" | "jigsaws-expert-v1";

export interface GhostReferenceCatalogItem {
  id: GhostReferenceSourceId;
  label: string;
  url: string;
  sourceType: "internal-recording" | "dataset";
  attribution: string | null;
}

export const GHOST_REFERENCE_SOURCES: readonly GhostReferenceCatalogItem[] = [
  {
    id: "synthetic-v1",
    label: "Canonical Scene Guide (v1)",
    url: "/references/needle-passing/needle-passing-reference-v1.json",
    sourceType: "internal-recording",
    attribution: null,
  },
  {
    id: "jigsaws-expert-v1",
    label: "JIGSAWS Expert E005 (GRS 17)",
    url: "/references/needle-passing/needle-passing-jigsaws-expert-v1.json",
    sourceType: "dataset",
    attribution:
      "JIGSAWS Needle_Passing_E005 (expert, GRS 17) — Gao et al., MICCAI M2CAI Workshop 2014 (academic/non-commercial use).",
  },
] as const;

export const NEEDLE_PASSING_SEGMENT_ORDER: readonly NeedlePassingSegment[] = [
  "approach",
  "grip",
  "align",
  "entry",
  "rotation",
  "exit",
  "release",
  "complete",
] as const;

export interface WorkspaceFitBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export const DEFAULT_WORKSPACE_BOUNDS: Readonly<WorkspaceFitBounds> = {
  xMin: -0.26,
  xMax: 0.26,
  yMin: Math.max(0.14, TISSUE_WALL_ZONE.center.y + TISSUE_WALL_ZONE.halfExtents.y + 0.05),
  yMax: 0.36,
  zMin: -0.05,
  zMax: 0.08,
};

export interface GhostTrailData {
  leftTipPoints: Vec3[];
  rightTipPoints: Vec3[];
  segmentRanges: Array<{
    segmentId: string;
    startIndex: number;
    endIndex: number;
  }>;
}

const NEEDLE_SEGMENT_SET = new Set<string>(NEEDLE_PASSING_SEGMENT_ORDER);

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(len) || len < 1e-8) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

function zQuatRad(rad: number): Quat {
  const half = rad * 0.5;
  return normalizeQuat({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) });
}

/**
 * Derive the instrument grip pose so that its jaw contact center (`TIP_OFFSET`)
 * lands at `tool.tipPosition` under `tool.rotation`. Works identically for both
 * `reference_builder.py` outputs (`position == tipPosition`) and
 * `ToolSimulationController` outputs (`tipPosition == position + rotate(TIP_OFFSET)`).
 */
export function resolveGhostToolPose(tool: ToolState): Pose & { tipPosition: Vec3; jawClosed: boolean } {
  const rotation = normalizeQuat(tool.rotation);
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const rotatedOffset = new Vector3(TIP_OFFSET.x, TIP_OFFSET.y, TIP_OFFSET.z).applyQuaternion(q);
  const tipPosition = {
    x: Number.isFinite(tool.tipPosition.x) ? tool.tipPosition.x : 0,
    y: Number.isFinite(tool.tipPosition.y) ? tool.tipPosition.y : 0,
    z: Number.isFinite(tool.tipPosition.z) ? tool.tipPosition.z : 0,
  };
  return {
    position: {
      x: tipPosition.x - rotatedOffset.x,
      y: tipPosition.y - rotatedOffset.y,
      z: tipPosition.z - rotatedOffset.z,
    },
    rotation,
    tipPosition,
    jawClosed: Boolean(tool.jawClosed),
  };
}

export function normalizeToolWithGripOffset(tool: ToolState): ToolState {
  const resolved = resolveGhostToolPose(tool);
  return {
    ...tool,
    position: resolved.position,
    rotation: resolved.rotation,
    tipPosition: resolved.tipPosition,
    jawClosed: resolved.jawClosed,
  };
}

function deriveSegmentsFromFrames(frames: readonly MotionFrame[]): ReferenceMotion["segments"] {
  const segments: ReferenceMotion["segments"] = [];
  for (const frame of frames) {
    const last = segments.at(-1);
    if (last && last.id === frame.segmentId) {
      last.endMs = frame.tMs;
    } else {
      segments.push({ id: frame.segmentId, startMs: frame.tMs, endMs: frame.tMs });
    }
  }
  return segments;
}

function lerp3(a: Vec3, b: Vec3, u: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

/**
 * Construct a 30 Hz scene-aligned canonical `ReferenceMotion` whose active tool
 * trajectory visits the exact 3D scene checkpoints:
 * - Rest `(-0.28, 0.34, 0)` -> Needle `(0, 0.35, 0)` (`approach`)
 * - Grasp Needle at `(0, 0.35, 0)` -> Entry Ring 1 `(-0.16, 0.24, 0)` (`grip`)
 * - Orient at Entry Ring 1 `(-0.16, 0.24, 0)` (`align`)
 * - Follow curved corridor from Ring 1 to Apex Ring 2 `(0, 0.18, 0)` (`entry`)
 * - Rotate wrist through Apex Ring 2 to Exit Ring 3 `(0.16, 0.24, 0)` (`rotation`)
 * - Pull needle from Exit Ring 3 to Release Zone `(0.20, 0.36, 0)` (`exit`)
 * - Open jaws inside Release Zone `(0.20, 0.36, 0)` (`release` -> `complete`)
 *
 * The assisting right instrument stays calmly parked at rest `(0.42, 0.28, 0)` so
 * the user clearly sees this is a single-instrument needle pass.
 */
export function buildSceneAlignedGhostReference(): ReferenceMotion {
  const needleStart: Vec3 = { x: 0, y: 0.35, z: 0 };
  const ring1 = NEEDLE_PASSING_RINGS[0].position;
  const ring3 = NEEDLE_PASSING_RINGS[2].position;
  const releasePos = RELEASE_ZONE.position;
  const restLeft: Vec3 = { x: -0.28, y: 0.34, z: 0 };
  const restRight: Vec3 = { x: 0.42, y: 0.28, z: 0 };
  const finishLeft: Vec3 = { x: 0.23, y: 0.38, z: 0 };

  const phasePlan: Array<{
    segmentId: NeedlePassingSegment;
    sampleCount: number;
    evalSample: (u: number) => { tip: Vec3; rotZRad: number; closed: boolean };
  }> = [
    {
      segmentId: "approach",
      sampleCount: 12,
      evalSample: u => ({
        tip: lerp3(restLeft, needleStart, u),
        rotZRad: 0,
        closed: false,
      }),
    },
    {
      segmentId: "grip",
      sampleCount: 12,
      evalSample: u => ({
        tip: lerp3(needleStart, { x: ring1.x - 0.02, y: ring1.y + 0.02, z: 0 }, (u + 0.08) / 1.08),
        rotZRad: -0.12 * ((u + 0.08) / 1.08),
        closed: true,
      }),
    },
    {
      segmentId: "align",
      sampleCount: 8,
      evalSample: u => ({
        tip: lerp3({ x: ring1.x - 0.015, y: ring1.y + 0.015, z: 0 }, ring1, (u + 0.1) / 1.1),
        rotZRad: -0.12 - 0.03 * ((u + 0.1) / 1.1),
        closed: true,
      }),
    },
    {
      segmentId: "entry",
      sampleCount: 14,
      evalSample: u => ({
        tip: corridorArcPoint(0.5 * ((u + 0.07) / 1.07)),
        rotZRad: -0.15 + 0.15 * ((u + 0.07) / 1.07),
        closed: true,
      }),
    },
    {
      segmentId: "rotation",
      sampleCount: 18,
      evalSample: u => ({
        tip: corridorArcPoint(0.5 + 0.5 * ((u + 0.05) / 1.05)),
        rotZRad: 0.35 * ((u + 0.05) / 1.05),
        closed: true,
      }),
    },
    {
      segmentId: "exit",
      sampleCount: 12,
      evalSample: u => ({
        tip: lerp3(ring3, releasePos, (u + 0.08) / 1.08),
        rotZRad: 0.35 * (1 - 0.5 * ((u + 0.08) / 1.08)),
        closed: true,
      }),
    },
    {
      segmentId: "release",
      sampleCount: 8,
      evalSample: u => ({
        tip: lerp3(releasePos, finishLeft, 0.5 * ((u + 0.12) / 1.12)),
        rotZRad: 0.1,
        closed: u < 0.35,
      }),
    },
    {
      segmentId: "complete",
      sampleCount: 4,
      evalSample: u => ({
        tip: lerp3(releasePos, finishLeft, 0.55 + 0.45 * ((u + 0.2) / 1.2)),
        rotZRad: 0,
        closed: false,
      }),
    },
  ];

  const rawSamples: Array<{
    segmentId: NeedlePassingSegment;
    tip: Vec3;
    rotZRad: number;
    closed: boolean;
  }> = [];

  for (const phase of phasePlan) {
    for (let i = 0; i < phase.sampleCount; i++) {
      const u = phase.sampleCount > 1 ? i / (phase.sampleCount - 1) : 1;
      rawSamples.push({
        segmentId: phase.segmentId,
        ...phase.evalSample(u),
      });
    }
  }

  const fps = 30;
  const stepMs = 1000 / fps;
  const totalIndex = Math.max(1, rawSamples.length - 1);

  const frames: MotionFrame[] = rawSamples.map((sample, idx) => {
    const tMs = Math.round(idx * stepMs * 1000) / 1000;
    const normalizedProgress = Math.round((idx / totalIndex) * 1_000_000) / 1_000_000;
    const leftRot = zQuatRad(sample.rotZRad);
    const leftTool = normalizeToolWithGripOffset({
      id: "left-tool",
      position: sample.tip,
      rotation: leftRot,
      tipPosition: sample.tip,
      jawClosed: sample.closed,
      ...(sample.closed ? { heldObjectId: NEEDLE_ID } : {}),
    });
    const rightTool = normalizeToolWithGripOffset({
      id: "right-tool",
      position: restRight,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      tipPosition: restRight,
      jawClosed: false,
    });
    return {
      tMs,
      segmentId: sample.segmentId,
      normalizedProgress,
      leftTool,
      rightTool,
    };
  });

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: "needle-passing-reference-v1",
    skillId: "needle-passing",
    sourceType: "internal-recording",
    sourceName: "Canonical scene-aligned needle-passing guide",
    coordinateSystem: COORDINATE_SYSTEM,
    fps,
    segments: deriveSegmentsFromFrames(frames),
    frames,
  };
}

/**
 * Map JIGSAWS gesture annotations (`G1`–`G15`) to canonical Needle Passing
 * skill segments (`approach -> grip -> align -> entry -> rotation -> exit -> release -> complete`).
 * References that already use Needle Passing segment IDs are returned with their
 * segment labels intact.
 */
export function mapJigsawsGesturesToSegments(reference: ReferenceMotion): ReferenceMotion {
  const frames = reference.frames;
  if (frames.length === 0) return reference;

  const allCanonical = frames.every(f => NEEDLE_SEGMENT_SET.has(f.segmentId));
  if (allCanonical) {
    return reference;
  }

  const runs: Array<{ gesture: string; startIndex: number; endIndex: number }> = [];
  for (let i = 0; i < frames.length; i++) {
    const gesture = frames[i].segmentId;
    const prev = runs.at(-1);
    if (prev && prev.gesture === gesture) {
      prev.endIndex = i;
    } else {
      runs.push({ gesture, startIndex: i, endIndex: i });
    }
  }

  const mappedSegmentByFrame = new Array<NeedlePassingSegment>(frames.length).fill("approach");

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    const len = run.endIndex - run.startIndex + 1;
    const prevGesture = runs[r - 1]?.gesture;

    for (let i = run.startIndex; i <= run.endIndex; i++) {
      const localU = len > 1 ? (i - run.startIndex) / (len - 1) : 0;
      let seg: NeedlePassingSegment;
      switch (run.gesture) {
        case "G1":
          seg = "approach";
          break;
        case "G5":
          seg = "grip";
          break;
        case "G8":
          seg = "align";
          break;
        case "G2":
          // When G8 ("orienting needle") immediately precedes G2, G8 already covers "align",
          // so G2 ("positioning needle tip at entry") maps directly to "entry". On subsequent
          // passes without G8 (e.g. G4 -> G2 -> G3), G2 supplies both "align" and "entry".
          seg = prevGesture === "G8" ? "entry" : localU < 0.5 ? "align" : "entry";
          break;
        case "G3":
          seg = localU < 0.35 ? "entry" : "rotation";
          break;
        case "G6":
          seg = "exit";
          break;
        case "G4":
          seg = "release";
          break;
        case "G11":
          seg = localU < 0.8 ? "release" : "complete";
          break;
        default: {
          const globalU = frames.length > 1 ? i / (frames.length - 1) : 0;
          const idx = Math.min(
            NEEDLE_PASSING_SEGMENT_ORDER.length - 1,
            Math.floor(globalU * NEEDLE_PASSING_SEGMENT_ORDER.length),
          );
          seg = NEEDLE_PASSING_SEGMENT_ORDER[idx];
          break;
        }
      }
      mappedSegmentByFrame[i] = seg;
    }
  }

  mappedSegmentByFrame[frames.length - 1] = "complete";

  const nextFrames: MotionFrame[] = frames.map((frame, index) => ({
    ...frame,
    segmentId: mappedSegmentByFrame[index],
  }));

  return {
    ...reference,
    segments: deriveSegmentsFromFrames(nextFrames),
    frames: nextFrames,
  };
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const span = inMax - inMin;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-8) {
    return 0.5 * (outMin + outMax);
  }
  const u = Math.min(1, Math.max(0, (value - inMin) / span));
  return outMin + u * (outMax - outMin);
}

/**
 * Fit a raw-scale dataset `ReferenceMotion` (such as JIGSAWS patient-side metre
 * coordinates) into the canonical Needle Passing workspace while keeping
 * scene-scale references (`sourceType === "internal-recording"`) at their
 * authored scene coordinates.
 */
export function fitReferenceToWorkspace(
  reference: ReferenceMotion,
  bounds: WorkspaceFitBounds = DEFAULT_WORKSPACE_BOUNDS,
  forceFit = false,
): ReferenceMotion {
  const frames = reference.frames;
  if (frames.length === 0) return reference;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const frame of frames) {
    for (const tip of [frame.leftTool.tipPosition, frame.rightTool.tipPosition]) {
      if (tip.x < minX) minX = tip.x;
      if (tip.x > maxX) maxX = tip.x;
      if (tip.y < minY) minY = tip.y;
      if (tip.y > maxY) maxY = tip.y;
      if (tip.z < minZ) minZ = tip.z;
      if (tip.z > maxZ) maxZ = tip.z;
    }
  }

  const xSpan = maxX - minX;
  const needsWorkspaceFit =
    forceFit || reference.sourceType === "dataset" || xSpan < 0.22 || minY < TISSUE_WALL_ZONE.center.y;

  const transformTool = (tool: ToolState): ToolState => {
    const fittedTip: Vec3 = needsWorkspaceFit
      ? {
          x: mapRange(tool.tipPosition.x, minX, maxX, bounds.xMin, bounds.xMax),
          y: mapRange(tool.tipPosition.y, minY, maxY, bounds.yMin, bounds.yMax),
          z: mapRange(tool.tipPosition.z, minZ, maxZ, bounds.zMin, bounds.zMax),
        }
      : { ...tool.tipPosition };

    return normalizeToolWithGripOffset({
      ...tool,
      tipPosition: fittedTip,
    });
  };

  const nextFrames: MotionFrame[] = frames.map(frame => ({
    ...frame,
    leftTool: transformTool(frame.leftTool),
    rightTool: transformTool(frame.rightTool),
  }));

  return {
    ...reference,
    frames: nextFrames,
  };
}

function averageVec3(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  return { x: x / points.length, y: y / points.length, z: z / points.length };
}

function averageQuat(quats: readonly Quat[]): Quat {
  if (quats.length === 0) return { x: 0, y: 0, z: 0, w: 1 };
  const anchor = normalizeQuat(quats[0]);
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (const candidate of quats) {
    const q = normalizeQuat(candidate);
    const dot = anchor.x * q.x + anchor.y * q.y + anchor.z * q.z + anchor.w * q.w;
    const sign = dot < 0 ? -1 : 1;
    x += sign * q.x;
    y += sign * q.y;
    z += sign * q.z;
    w += sign * q.w;
  }
  return normalizeQuat({ x, y, z, w });
}

/**
 * Plan §7.5: 7-frame centered moving average for display/ghost rendering.
 * Endpoints (`index === 0` and `index === length - 1`) are preserved exactly
 * so the trajectory starts and ends on the canonical reference endpoints.
 */
export function smoothReferenceForDisplay(reference: ReferenceMotion, windowSize = 7): ReferenceMotion {
  const frames = reference.frames;
  if (frames.length <= 2 || windowSize <= 1) {
    return {
      ...reference,
      frames: frames.map(frame => ({
        ...frame,
        leftTool: normalizeToolWithGripOffset(frame.leftTool),
        rightTool: normalizeToolWithGripOffset(frame.rightTool),
      })),
    };
  }

  const radius = Math.max(1, Math.floor(windowSize / 2));
  const nextFrames: MotionFrame[] = frames.map((frame, index) => {
    if (index === 0 || index === frames.length - 1) {
      return {
        ...frame,
        leftTool: normalizeToolWithGripOffset(frame.leftTool),
        rightTool: normalizeToolWithGripOffset(frame.rightTool),
      };
    }
    const maxRadius = Math.min(radius, index, frames.length - 1 - index);
    const leftTips: Vec3[] = [];
    const rightTips: Vec3[] = [];
    const leftQuats: Quat[] = [];
    const rightQuats: Quat[] = [];

    for (let offset = -maxRadius; offset <= maxRadius; offset++) {
      const sample = frames[index + offset];
      leftTips.push(sample.leftTool.tipPosition);
      rightTips.push(sample.rightTool.tipPosition);
      leftQuats.push(sample.leftTool.rotation);
      rightQuats.push(sample.rightTool.rotation);
    }

    const leftTool = normalizeToolWithGripOffset({
      ...frame.leftTool,
      tipPosition: averageVec3(leftTips),
      rotation: averageQuat(leftQuats),
    });
    const rightTool = normalizeToolWithGripOffset({
      ...frame.rightTool,
      tipPosition: averageVec3(rightTips),
      rotation: averageQuat(rightQuats),
    });

    return {
      ...frame,
      leftTool,
      rightTool,
    };
  });

  return {
    ...reference,
    frames: nextFrames,
  };
}

/**
 * Full preparation pipeline for ghost rendering:
 * 1. Map dataset gestures (`G1`–`G15`) to skill segments if needed.
 * 2. Fit raw dataset coordinates into canonical workspace while keeping scene-scale references intact.
 * 3. Optionally apply 7-frame centered display smoothing.
 */
export function prepareGhostReference(
  reference: ReferenceMotion,
  options: { smoothWindow?: number; forceWorkspaceFit?: boolean } = {},
): ReferenceMotion {
  const mapped = mapJigsawsGesturesToSegments(reference);
  const fitted = fitReferenceToWorkspace(mapped, DEFAULT_WORKSPACE_BOUNDS, Boolean(options.forceWorkspaceFit));
  const smoothWindow = options.smoothWindow ?? 1;
  return smoothWindow > 1 ? smoothReferenceForDisplay(fitted, smoothWindow) : fitted;
}

/**
 * Extract the exact tool-tip path coordinates from a `ReferenceMotion` for rendering
 * the ghost trajectory trail and verifying path fidelity against the JSON.
 */
export function extractGhostTrailPoints(reference: ReferenceMotion, maxPoints = 240): GhostTrailData {
  const frames = reference.frames;
  if (frames.length === 0) {
    return { leftTipPoints: [], rightTipPoints: [], segmentRanges: [] };
  }

  const stride = frames.length > maxPoints ? Math.ceil(frames.length / maxPoints) : 1;
  const indices: number[] = [];
  for (let i = 0; i < frames.length; i += stride) {
    indices.push(i);
  }
  if (indices.at(-1) !== frames.length - 1) {
    indices.push(frames.length - 1);
  }

  const leftTipPoints = indices.map(i => ({ ...frames[i].leftTool.tipPosition }));
  const rightTipPoints = indices.map(i => ({ ...frames[i].rightTool.tipPosition }));

  const segmentRanges: GhostTrailData["segmentRanges"] = [];
  for (let p = 0; p < indices.length; p++) {
    const segId = frames[indices[p]].segmentId;
    const prev = segmentRanges.at(-1);
    if (prev && prev.segmentId === segId) {
      prev.endIndex = p;
    } else {
      segmentRanges.push({ segmentId: segId, startIndex: p, endIndex: p });
    }
  }

  return { leftTipPoints, rightTipPoints, segmentRanges };
}

export const RAW_DEFAULT_NEEDLE_PASSING_REFERENCE: ReferenceMotion = parseReference(needlePassingReferenceJson);
export const SCENE_ALIGNED_NEEDLE_PASSING_REFERENCE: ReferenceMotion = buildSceneAlignedGhostReference();
export const DEFAULT_NEEDLE_PASSING_REFERENCE: ReferenceMotion = SCENE_ALIGNED_NEEDLE_PASSING_REFERENCE;
