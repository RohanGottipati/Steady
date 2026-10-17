import type { ExerciseSnapshot } from "./exercise-controller";
import {
  DEFAULT_NEEDLE_PASSING_REFERENCE,
  extractGhostTrailPoints,
  GHOST_REFERENCE_SOURCES,
  normalizeQuat,
  prepareGhostReference,
  resolveGhostToolPose,
  type GhostReferenceSourceId,
  type GhostTrailData,
} from "./ghost-reference";
import type { Pose } from "@/lib/simulation/tool-simulation";
import type { Quat, ReferenceMotion, ToolState, Vec3 } from "@/types";

export type GhostPlaybackSpeed = 0.5 | 1;
export type GhostSyncMode = "progress-coupled" | "continuous";

export interface InterpolatedGhostFrame {
  tMs: number;
  normalizedProgress: number;
  segmentId: string;
  bracketIndices: [number, number];
  alpha: number;
  leftTool: ToolState;
  rightTool: ToolState;
  leftPose: Pose;
  rightPose: Pose;
  needlePose: Pose;
  needleHeldBy: "left-tool" | "right-tool" | null;
}

export interface GhostSnapshot {
  visible: boolean;
  showTrail: boolean;
  activeSide: "left" | "right";
  actionLabel: string;
  referenceId: string;
  referenceSourceId: GhostReferenceSourceId;
  sourceName: string;
  attribution: string | null;
  speed: GhostPlaybackSpeed;
  syncMode: GhostSyncMode;
  activeBehavior: "hidden" | "demonstration" | "progress-coupled" | "stall-loop" | "continuous" | "complete";
  tMs: number;
  normalizedProgress: number;
  segmentId: string;
  segmentProgress: number;
  stalled: boolean;
  bracketIndices: [number, number];
  alpha: number;
  leftTool: ToolState;
  rightTool: ToolState;
  leftPose: Pose;
  rightPose: Pose;
  needlePose: Pose;
  needleHeldBy: "left-tool" | "right-tool" | null;
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const GHOST_ACTION_BY_SEGMENT: Record<string, string> = {
  approach: "Step 1: Move one open instrument tip into the top needle circle.",
  grip: "Step 2: Pinch to grasp the needle, then carry it down-left to Entry Ring 1.",
  align: "Step 3: Hold the needle level at Entry Ring 1 (left).",
  entry: "Step 4: Guide the needle along the curve from Ring 1 into Center Ring 2.",
  rotation: "Step 5: Rotate your wrist (~15°) as you curve from Ring 2 through Exit Ring 3 (right).",
  exit: "Step 6: Pull the needle clear of Ring 3 up into the top-right Release Ring.",
  release: "Step 7: Open your thumb and index finger inside the Release Ring to finish.",
  complete: "Complete: Needle passed through all 3 rings and released cleanly.",
};

const PEG_GHOST_ACTIONS: Record<string, string> = {
  reach: "Reach the peg on the left post with an open instrument.",
  grasp: "Pinch to grasp the peg on the left post.",
  lift: "Lift the peg clear of the left post.",
  transfer: "Carry the peg through the midline and meet it with the other instrument.",
  place: "Lower the peg onto the right post.",
  release: "Open the pinch to release the peg on the right post.",
  complete: "Complete: peg moved from the left post to the right post.",
};

export function describeGhostAction(segmentId: string, referenceId?: string): string {
  const table = referenceId === "peg-transfer-reference-v1" ? PEG_GHOST_ACTIONS : GHOST_ACTION_BY_SEGMENT;
  return table[segmentId] ?? `Showing ${segmentId} trajectory.`;
}

export function lerpVec3(a: Vec3, b: Vec3, alpha: number): Vec3 {
  const u = clamp(alpha, 0, 1);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

/**
 * Shortest-path spherical linear interpolation between two quaternions.
 * Guaranteed unit-norm and free of hemisphere sign flips (`dot < 0`).
 */
export function slerpQuat(a: Quat, b: Quat, alpha: number): Quat {
  const u = clamp(alpha, 0, 1);
  const qa = normalizeQuat(a);
  const qb = normalizeQuat(b);

  let dot = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;
  let bx = qb.x;
  let by = qb.y;
  let bz = qb.z;
  let bw = qb.w;

  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  if (dot > 0.9995) {
    return normalizeQuat({
      x: qa.x + (bx - qa.x) * u,
      y: qa.y + (by - qa.y) * u,
      z: qa.z + (bz - qa.z) * u,
      w: qa.w + (bw - qa.w) * u,
    });
  }

  const theta0 = Math.acos(clamp(dot, -1, 1));
  const sinTheta0 = Math.sin(theta0);
  const theta = theta0 * u;
  const s0 = Math.cos(theta) - (dot * Math.sin(theta)) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;

  return normalizeQuat({
    x: s0 * qa.x + s1 * bx,
    y: s0 * qa.y + s1 * by,
    z: s0 * qa.z + s1 * bz,
    w: s0 * qa.w + s1 * bw,
  });
}

export function interpolateGhostTool(a: ToolState, b: ToolState, alpha: number): ToolState {
  const u = clamp(alpha, 0, 1);
  const tipPosition = lerpVec3(a.tipPosition, b.tipPosition, u);
  const rotation = slerpQuat(a.rotation, b.rotation, u);
  const jawClosed = (u < 0.5 ? a : b).jawClosed;
  const resolved = resolveGhostToolPose({
    id: a.id,
    position: tipPosition,
    rotation,
    tipPosition,
    jawClosed,
  });

  return {
    id: a.id,
    position: resolved.position,
    rotation: resolved.rotation,
    tipPosition: resolved.tipPosition,
    jawClosed: resolved.jawClosed,
    ...((u < 0.5 ? a : b).heldObjectId ? { heldObjectId: (u < 0.5 ? a : b).heldObjectId } : {}),
  };
}

function buildInterpolatedFrame(
  reference: ReferenceMotion,
  i0: number,
  i1: number,
  alpha: number,
  segmentIdOverride?: string,
): InterpolatedGhostFrame {
  const frames = reference.frames;
  const f0 = frames[i0];
  const f1 = frames[i1];
  const u = clamp(alpha, 0, 1);

  const leftTool = interpolateGhostTool(f0.leftTool, f1.leftTool, u);
  const rightTool = interpolateGhostTool(f0.rightTool, f1.rightTool, u);
  const leftPose: Pose = { position: { ...leftTool.position }, rotation: { ...leftTool.rotation } };
  const rightPose: Pose = { position: { ...rightTool.position }, rotation: { ...rightTool.rotation } };

  const needleHeldBy: "left-tool" | "right-tool" | null = leftTool.jawClosed
    ? "left-tool"
    : rightTool.jawClosed
      ? "right-tool"
      : null;

  const needlePose: Pose =
    needleHeldBy === "left-tool"
      ? { position: { ...leftTool.tipPosition }, rotation: { ...leftTool.rotation } }
      : needleHeldBy === "right-tool"
        ? { position: { ...rightTool.tipPosition }, rotation: { ...rightTool.rotation } }
        : { position: { x: 0, y: 0.35, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };

  const tMs = f0.tMs + (f1.tMs - f0.tMs) * u;
  const normalizedProgress = clamp(
    f0.normalizedProgress + (f1.normalizedProgress - f0.normalizedProgress) * u,
    0,
    1,
  );
  const segmentId = segmentIdOverride ?? (u < 0.5 ? f0.segmentId : f1.segmentId);

  return {
    tMs,
    normalizedProgress,
    segmentId,
    bracketIndices: [i0, i1],
    alpha: u,
    leftTool,
    rightTool,
    leftPose,
    rightPose,
    needlePose,
    needleHeldBy,
  };
}

/**
 * Sample a `ReferenceMotion` at an arbitrary timestamp `tMs` with sub-frame
 * linear position interpolation and shortest-path quaternion slerp.
 */
export function sampleReferenceAtTime(reference: ReferenceMotion, tMs: number): InterpolatedGhostFrame {
  const frames = reference.frames;
  if (frames.length === 0) {
    throw new Error("ReferenceMotion contains no frames.");
  }
  if (frames.length === 1) {
    return buildInterpolatedFrame(reference, 0, 0, 0);
  }

  const startMs = frames[0].tMs;
  const endMs = frames[frames.length - 1].tMs;
  const clampedT = clamp(tMs, startMs, endMs);

  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs <= clampedT) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const span = frames[hi].tMs - frames[lo].tMs;
  const alpha = span > 1e-9 ? (clampedT - frames[lo].tMs) / span : 0;
  return buildInterpolatedFrame(reference, lo, hi, alpha);
}

/**
 * Sample a `ReferenceMotion` at normalized progress `u ∈ [0, 1]` with sub-frame
 * linear position interpolation and shortest-path quaternion slerp.
 */
export function sampleReferenceAtProgress(
  reference: ReferenceMotion,
  normalizedProgress: number,
): InterpolatedGhostFrame {
  const frames = reference.frames;
  if (frames.length === 0) {
    throw new Error("ReferenceMotion contains no frames.");
  }
  if (frames.length === 1) {
    return buildInterpolatedFrame(reference, 0, 0, 0);
  }

  const u = clamp(normalizedProgress, 0, 1);
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].normalizedProgress <= u) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const span = frames[hi].normalizedProgress - frames[lo].normalizedProgress;
  const alpha = span > 1e-9 ? (u - frames[lo].normalizedProgress) / span : 0;
  return buildInterpolatedFrame(reference, lo, hi, alpha);
}

/**
 * Sample a `ReferenceMotion` within a specific `segmentId` at normalized segment
 * progress `segmentProgress ∈ [0, 1]`. Connects smoothly to the first frame of the
 * immediately following segment so transitions between segments are continuous.
 */
export function sampleReferenceInSegment(
  reference: ReferenceMotion,
  segmentId: string,
  segmentProgress: number,
): InterpolatedGhostFrame {
  const frames = reference.frames;
  if (frames.length === 0) {
    throw new Error("ReferenceMotion contains no frames.");
  }

  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].segmentId === segmentId) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    } else if (firstIdx !== -1) {
      break;
    }
  }

  if (firstIdx === -1) {
    return sampleReferenceAtProgress(reference, segmentProgress);
  }

  const endIdx = Math.min(frames.length - 1, lastIdx + 1);
  if (firstIdx === endIdx) {
    return buildInterpolatedFrame(reference, firstIdx, endIdx, 0, segmentId);
  }

  const u = clamp(segmentProgress, 0, 1);
  const exactIndex = firstIdx + u * (endIdx - firstIdx);
  const i0 = Math.min(Math.floor(exactIndex), endIdx - 1);
  const i1 = i0 + 1;
  const alpha = exactIndex - i0;

  return buildInterpolatedFrame(reference, i0, i1, alpha, segmentId);
}

export class GhostPlaybackController {
  private reference: ReferenceMotion;
  private referenceSourceId: GhostReferenceSourceId;
  private attribution: string | null;
  private trailData: GhostTrailData;
  private speed: GhostPlaybackSpeed;
  private syncMode: GhostSyncMode;
  private activeSide: "left" | "right" = "left";
  readonly leadOffset: number;
  readonly cycleDurationMs: number;
  snapshot: GhostSnapshot;

  private continuousProgress = 0;
  private demoProgress = 0;
  private coupledSegmentId = "approach";
  private coupledSegmentProgress = 0;
  private lastUserSegmentId = "";
  private lastUserSegmentProgress = -1;
  private stallDurationMs = 0;
  private stallLoopPhase = 0;

  constructor({
    reference = DEFAULT_NEEDLE_PASSING_REFERENCE,
    referenceSourceId = "synthetic-v1",
    speed = 1,
    syncMode = "progress-coupled",
    leadOffset = 0.12,
    cycleDurationMs = 4500,
  }: {
    reference?: ReferenceMotion;
    referenceSourceId?: GhostReferenceSourceId;
    speed?: GhostPlaybackSpeed;
    syncMode?: GhostSyncMode;
    leadOffset?: number;
    cycleDurationMs?: number;
  } = {}) {
    this.reference = prepareGhostReference(reference);
    this.referenceSourceId = referenceSourceId;
    this.attribution =
      GHOST_REFERENCE_SOURCES.find(item => item.id === referenceSourceId)?.attribution ?? null;
    this.trailData = extractGhostTrailPoints(this.reference);
    this.speed = speed;
    this.syncMode = syncMode;
    this.leadOffset = clamp(leadOffset, 0.05, 0.15);
    this.cycleDurationMs = Math.max(500, cycleDurationMs);
    this.coupledSegmentId = this.reference.frames[0]?.segmentId ?? "approach";
    this.snapshot = this.buildSnapshot(
      sampleReferenceAtProgress(this.reference, 0),
      false,
      false,
      "hidden",
      0,
      false,
    );
  }

  getReference(): ReferenceMotion {
    return this.reference;
  }

  getTrailData(): GhostTrailData {
    return this.trailData;
  }

  setActiveSide(side: "left" | "right") {
    this.activeSide = side;
  }

  setReference(reference: ReferenceMotion, sourceId: GhostReferenceSourceId = "synthetic-v1") {
    this.reference = prepareGhostReference(reference, {
      smoothWindow: sourceId === "jigsaws-expert-v1" ? 7 : 1,
    });
    this.referenceSourceId = sourceId;
    this.attribution =
      GHOST_REFERENCE_SOURCES.find(item => item.id === sourceId)?.attribution ?? null;
    this.trailData = extractGhostTrailPoints(this.reference);
    this.reset();
  }

  setSpeed(speed: GhostPlaybackSpeed) {
    if (speed !== 0.5 && speed !== 1) return;
    this.speed = speed;
    this.snapshot = { ...this.snapshot, speed };
  }

  setSyncMode(syncMode: GhostSyncMode) {
    if (syncMode !== "progress-coupled" && syncMode !== "continuous") return;
    this.syncMode = syncMode;
    this.stallDurationMs = 0;
    this.stallLoopPhase = 0;
    this.snapshot = { ...this.snapshot, syncMode };
  }

  reset() {
    this.continuousProgress = 0;
    this.demoProgress = 0;
    this.coupledSegmentId = this.reference.frames[0]?.segmentId ?? "approach";
    this.coupledSegmentProgress = 0;
    this.lastUserSegmentId = "";
    this.lastUserSegmentProgress = -1;
    this.stallDurationMs = 0;
    this.stallLoopPhase = 0;
    this.snapshot = this.buildSnapshot(
      sampleReferenceAtProgress(this.reference, 0),
      this.snapshot.visible,
      this.snapshot.showTrail,
      this.snapshot.visible ? "demonstration" : "hidden",
      0,
      false,
    );
  }

  suspend() {
    this.stallDurationMs = 0;
  }

  private buildSnapshot(
    sampled: InterpolatedGhostFrame,
    visible: boolean,
    showTrail: boolean,
    activeBehavior: GhostSnapshot["activeBehavior"],
    segmentProgress: number,
    stalled: boolean,
  ): GhostSnapshot {
    return {
      visible,
      showTrail,
      activeSide: this.activeSide,
      actionLabel: visible ? describeGhostAction(sampled.segmentId, this.reference.id) : "Ghost hidden",
      referenceId: this.reference.id,
      referenceSourceId: this.referenceSourceId,
      sourceName: this.reference.sourceName,
      attribution: this.attribution,
      speed: this.speed,
      syncMode: this.syncMode,
      activeBehavior,
      tMs: sampled.tMs,
      normalizedProgress: sampled.normalizedProgress,
      segmentId: sampled.segmentId,
      segmentProgress: clamp(segmentProgress, 0, 1),
      stalled,
      bracketIndices: sampled.bracketIndices,
      alpha: sampled.alpha,
      leftTool: sampled.leftTool,
      rightTool: sampled.rightTool,
      leftPose: sampled.leftPose,
      rightPose: sampled.rightPose,
      needlePose: sampled.needlePose,
      needleHeldBy: sampled.needleHeldBy,
    };
  }

  update(exercise: ExerciseSnapshot | null, deltaSeconds: number): GhostSnapshot {
    const dtSeconds = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0;
    const dtMs = dtSeconds * 1000;

    if (!exercise || exercise.mode === "assessment" || !exercise.modeHooks.ghostVisible) {
      const hiddenSample = sampleReferenceAtProgress(
        this.reference,
        this.snapshot.normalizedProgress,
      );
      this.snapshot = this.buildSnapshot(hiddenSample, false, false, "hidden", 0, false);
      return this.snapshot;
    }

    const showTrail = exercise.modeHooks.showPathGuide && exercise.modeHooks.ghostVisible;

    if (exercise.phase === "demonstration") {
      this.demoProgress = clamp(
        this.demoProgress + (dtMs * this.speed) / this.cycleDurationMs,
        0,
        1,
      );
      if (this.demoProgress >= 1 && exercise.demonstrationProgress < 1) {
        this.demoProgress = this.demoProgress % 1;
      }
      const effectiveProgress =
        this.speed === 1 && exercise.demonstrationProgress > 0
          ? Math.max(this.demoProgress, clamp(exercise.demonstrationProgress, 0, 1))
          : this.demoProgress;
      const sampled = sampleReferenceAtProgress(this.reference, effectiveProgress);
      this.snapshot = this.buildSnapshot(
        sampled,
        true,
        showTrail,
        "demonstration",
        effectiveProgress,
        false,
      );
      return this.snapshot;
    }

    if (exercise.phase === "complete" && this.syncMode === "progress-coupled") {
      const sampled = sampleReferenceAtProgress(this.reference, 1);
      this.snapshot = this.buildSnapshot(sampled, true, showTrail, "complete", 1, false);
      return this.snapshot;
    }

    if (exercise.phase === "idle" || this.syncMode === "continuous") {
      this.continuousProgress =
        (this.continuousProgress + (dtMs * this.speed) / this.cycleDurationMs) % 1;
      const sampled = sampleReferenceAtProgress(this.reference, this.continuousProgress);
      this.snapshot = this.buildSnapshot(
        sampled,
        true,
        showTrail,
        exercise.phase === "idle" ? "demonstration" : "continuous",
        this.continuousProgress,
        false,
      );
      return this.snapshot;
    }

    // Active attempt in progress-coupled mode (Plan §11.4 Option B)
    const userSegId = exercise.segmentId;
    const userSegProg = clamp(exercise.segmentProgress, 0, 1);

    if (userSegId !== this.coupledSegmentId) {
      this.coupledSegmentId = userSegId;
      this.coupledSegmentProgress = clamp(userSegProg + this.leadOffset * 0.5, 0, 1);
      this.stallDurationMs = 0;
      this.stallLoopPhase = 0;
    }

    const sameUserProgress =
      userSegId === this.lastUserSegmentId &&
      Math.abs(userSegProg - this.lastUserSegmentProgress) < 1e-4;

    if (sameUserProgress && exercise.canProgress) {
      this.stallDurationMs += dtMs;
    } else if (!sameUserProgress) {
      this.stallDurationMs = 0;
      this.stallLoopPhase = 0;
    }

    this.lastUserSegmentId = userSegId;
    this.lastUserSegmentProgress = userSegProg;

    const baseTargetProg = clamp(userSegProg + this.leadOffset, 0, 1);
    const stalled = this.stallDurationMs >= 600;
    let desiredSegProg = baseTargetProg;

    if (stalled) {
      // If the user is still at the initial approach step and has not grabbed the needle yet,
      // play the full multi-step pass so they can see the entire Needle -> Ring 1..3 -> Release flow.
      if ((userSegId === "approach" || userSegId === "reach") && userSegProg < 0.45) {
        this.continuousProgress =
          (this.continuousProgress + (dtMs * this.speed) / this.cycleDurationMs) % 1;
        const fullPassSample = sampleReferenceAtProgress(this.reference, this.continuousProgress);
        this.snapshot = this.buildSnapshot(
          fullPassSample,
          true,
          showTrail,
          "stall-loop",
          this.continuousProgress,
          true,
        );
        return this.snapshot;
      }

      // Sweep clearly from the user's current point across the rest of the current step
      // so the user sees the full movement to the next ring.
      this.stallLoopPhase = (this.stallLoopPhase + (dtMs * this.speed) / 1800) % 1;
      const remainingSpan = Math.max(0.35, 1 - userSegProg);
      desiredSegProg = clamp(userSegProg + this.stallLoopPhase * remainingSpan, 0, 1);
    }

    // Smooth sub-frame chase at display refresh rate so 20–30 Hz tracking updates never step
    const chaseAlpha = dtSeconds > 0 ? 1 - Math.exp(-20 * dtSeconds * this.speed) : 1;
    this.coupledSegmentProgress = clamp(
      this.coupledSegmentProgress + (desiredSegProg - this.coupledSegmentProgress) * chaseAlpha,
      0,
      1,
    );

    const sampled = sampleReferenceInSegment(
      this.reference,
      this.coupledSegmentId,
      this.coupledSegmentProgress,
    );

    this.snapshot = this.buildSnapshot(
      sampled,
      true,
      showTrail,
      stalled ? "stall-loop" : "progress-coupled",
      this.coupledSegmentProgress,
      stalled,
    );
    return this.snapshot;
  }
}
