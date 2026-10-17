import type { MetricResult } from "@/types/evaluation";
import type { Vec3 } from "@/types/geometry";
import type { MotionFrame } from "@/types/motion";
import type { AlignedSample } from "./align";
import type { MetricContext } from "./context";
import { errorToScore, quatAngleDeg, tipDistance } from "./score";

// B5 default tolerances (canonical scene units / degrees / fractions). Skill
// definitions can reweight metrics; these keep raw-error → score deterministic.
export const EXTRA_TOLERANCES = {
  depthUnits: 0.15,
  stabilityWobble: 0.03,
  overshootReversals: 6,
  offPathFraction: 0.5,
  rotationStepDeg: 15,
  gripMismatchFraction: 0.5,
  pinchToggles: 4,
  workspaceExcessRatio: 0.5,
  relativeTransformUnits: 0.15,
  idleFraction: 0.5,
  collisionFraction: 0.3,
  dangerFraction: 0.3,
} as const;

const DEFAULT_COLLISION_RADIUS = 0.05;
const IDLE_SPEED_EPS = 0.004;

type Ctx = MetricContext;
type Side = "leftTool" | "rightTool";
const SIDES = ["left", "right"] as const;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function dist(a: Vec3, b: Vec3): number {
  return tipDistance(a, b);
}

function worstSample(samples: AlignedSample[], f: (s: AlignedSample) => number) {
  let best = samples[0];
  let bestV = -Infinity;
  for (const s of samples) {
    const v = f(s);
    if (v > bestV) {
      bestV = v;
      best = s;
    }
  }
  return best;
}

// --- Precision ---

export function depthConsistency(ctx: Ctx): MetricResult {
  const err = (s: AlignedSample) =>
    (Math.abs(s.user.left.tipPosition.z - s.ref.left.tipPosition.z) +
      Math.abs(s.user.right.tipPosition.z - s.ref.right.tipPosition.z)) /
    2;
  const value = mean(ctx.samples.map(err));
  const w = ctx.samples.length ? worstSample(ctx.samples, err) : undefined;
  return {
    id: "depthConsistency",
    score: errorToScore(value, EXTRA_TOLERANCES.depthUnits),
    rawValue: value,
    unit: "scene-units",
    tolerance: EXTRA_TOLERANCES.depthUnits,
    segmentId: w?.segmentId,
    evidence: w ? { startMs: w.refTMs } : undefined,
  };
}

// --- Control ---

// Wobble = mean distance of a tip from its own 3-sample moving average. A curvy
// but smooth reference path has low wobble; only jitter raises it, so we measure
// the user's excess over the reference's intrinsic wobble.
function wobble(frames: readonly MotionFrame[], side: Side): number {
  const p = frames.map((f) => f[side].tipPosition);
  if (p.length < 3) return 0;
  const devs: number[] = [];
  for (let i = 1; i < p.length - 1; i++) {
    const avg = {
      x: (p[i - 1].x + p[i].x + p[i + 1].x) / 3,
      y: (p[i - 1].y + p[i].y + p[i + 1].y) / 3,
      z: (p[i - 1].z + p[i].z + p[i + 1].z) / 3,
    };
    devs.push(dist(p[i], avg));
  }
  return mean(devs);
}

export function motionStability(ctx: Ctx): MetricResult {
  const userW = mean(SIDES.map((s) => wobble(ctx.user.frames, `${s}Tool`)));
  const refW = mean(SIDES.map((s) => wobble(ctx.reference.frames, `${s}Tool`)));
  const excess = Math.max(0, userW - refW);
  return {
    id: "motionStability",
    score: errorToScore(excess, EXTRA_TOLERANCES.stabilityWobble),
    rawValue: userW,
    unit: "scene-units",
    tolerance: EXTRA_TOLERANCES.stabilityWobble,
  };
}

function bySegment(samples: AlignedSample[]): Map<string, AlignedSample[]> {
  const by = new Map<string, AlignedSample[]>();
  for (const s of samples) {
    const list = by.get(s.segmentId) ?? [];
    list.push(s);
    by.set(s.segmentId, list);
  }
  return by;
}

// Count direction reversals in a distance series: each change from approaching to
// receding (or vice versa) is one overshoot/correction.
function distanceReversals(d: number[]): number {
  let reversals = 0;
  let prevDir = 0;
  for (let i = 1; i < d.length; i++) {
    const diff = d[i] - d[i - 1];
    const dir = diff > 1e-6 ? 1 : diff < -1e-6 ? -1 : 0;
    if (dir !== 0 && prevDir !== 0 && dir !== prevDir) reversals++;
    if (dir !== 0) prevDir = dir;
  }
  return reversals;
}

export function overshootControl(ctx: Ctx): MetricResult {
  // Per segment, the target is the goal at the segment end (the reference tip at
  // u=1). Curved expert paths naturally oscillate distance-to-target, so score the
  // user's *excess* reversals over the reference's own — a clone inherits none.
  let userReversals = 0;
  let refReversals = 0;
  for (const seg of bySegment(ctx.samples).values()) {
    if (seg.length < 3) continue;
    const target = seg[seg.length - 1].ref;
    for (const side of SIDES) {
      userReversals += distanceReversals(
        seg.map((s) => dist(s.user[side].tipPosition, target[side].tipPosition)),
      );
      refReversals += distanceReversals(
        seg.map((s) => dist(s.ref[side].tipPosition, target[side].tipPosition)),
      );
    }
  }
  const excess = Math.max(0, userReversals - refReversals);
  return {
    id: "overshootControl",
    score: errorToScore(excess, EXTRA_TOLERANCES.overshootReversals),
    rawValue: excess,
    unit: "count",
    tolerance: EXTRA_TOLERANCES.overshootReversals,
  };
}

export function correctionEfficiency(ctx: Ctx): MetricResult {
  const TOL = 0.15; // "off path" when mean tip deviation exceeds this
  const pairDev = (s: AlignedSample) =>
    (dist(s.user.left.tipPosition, s.ref.left.tipPosition) +
      dist(s.user.right.tipPosition, s.ref.right.tipPosition)) /
    2;
  const total = ctx.samples.length || 1;
  const off = ctx.samples.filter((s) => pairDev(s) > TOL);
  const fraction = off.length / total;
  const w = off.length ? worstSample(off, pairDev) : undefined;
  return {
    id: "correctionEfficiency",
    score: errorToScore(fraction, EXTRA_TOLERANCES.offPathFraction),
    rawValue: fraction,
    unit: "fraction",
    tolerance: EXTRA_TOLERANCES.offPathFraction,
    segmentId: w?.segmentId,
    evidence: w ? { startMs: w.refTMs } : undefined,
  };
}

// --- Technique ---

export function rotationControlAccuracy(ctx: Ctx): MetricResult {
  // Compare the per-step angular *change* (rotation dynamics) rather than absolute
  // orientation: failing to rotate when the reference does drives this down.
  const errs: number[] = [];
  const segs = bySegment(ctx.samples);
  for (const seg of segs.values()) {
    for (let i = 1; i < seg.length; i++) {
      for (const side of SIDES) {
        const refStep = quatAngleDeg(seg[i - 1].ref[side].rotation, seg[i].ref[side].rotation);
        const userStep = quatAngleDeg(seg[i - 1].user[side].rotation, seg[i].user[side].rotation);
        errs.push(Math.abs(userStep - refStep));
      }
    }
  }
  const value = mean(errs);
  return {
    id: "rotationControlAccuracy",
    score: errorToScore(value, EXTRA_TOLERANCES.rotationStepDeg),
    rawValue: value,
    unit: "deg",
    tolerance: EXTRA_TOLERANCES.rotationStepDeg,
  };
}

function jawToggles(frames: readonly MotionFrame[], side: Side): number {
  let toggles = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i][side].jawClosed !== frames[i - 1][side].jawClosed) toggles++;
  }
  return toggles;
}

export function pinchStability(ctx: Ctx): MetricResult {
  // No hand pinch-ratio stream in the reference data yet, so proxy grip chatter by
  // excess jaw toggles over the reference's intentional open/close transitions.
  const userT = SIDES.reduce((a, s) => a + jawToggles(ctx.user.frames, `${s}Tool`), 0);
  const refT = SIDES.reduce((a, s) => a + jawToggles(ctx.reference.frames, `${s}Tool`), 0);
  const excess = Math.max(0, userT - refT);
  return {
    id: "pinchStability",
    score: errorToScore(excess, EXTRA_TOLERANCES.pinchToggles),
    rawValue: excess,
    unit: "count",
    tolerance: EXTRA_TOLERANCES.pinchToggles,
  };
}

export function gripTiming(ctx: Ctx): MetricResult {
  // Fraction of aligned positions where the user's jaw state disagrees with the
  // reference's: a grip/release that happens in the wrong segment shows up here.
  let mismatch = 0;
  for (const s of ctx.samples) {
    for (const side of SIDES) {
      if (s.user[side].jawClosed !== s.ref[side].jawClosed) mismatch++;
    }
  }
  const fraction = ctx.samples.length ? mismatch / (2 * ctx.samples.length) : 0;
  return {
    id: "gripTiming",
    score: errorToScore(fraction, EXTRA_TOLERANCES.gripMismatchFraction),
    rawValue: fraction,
    unit: "fraction",
    tolerance: EXTRA_TOLERANCES.gripMismatchFraction,
  };
}

function positionRange(frames: readonly MotionFrame[], side: Side): number {
  const p = frames.map((f) => f[side].position);
  if (p.length === 0) return 0;
  const axis = (sel: (v: Vec3) => number) => {
    const vals = p.map(sel);
    return Math.max(...vals) - Math.min(...vals);
  };
  return Math.hypot(axis((v) => v.x), axis((v) => v.y), axis((v) => v.z));
}

export function handWorkspaceControl(ctx: Ctx): MetricResult {
  // Penalize ranging the hand over a much larger workspace than the task needs. A
  // constant positional offset leaves the range unchanged, so it is not penalized.
  const userR = mean(SIDES.map((s) => positionRange(ctx.user.frames, `${s}Tool`)));
  const refR = mean(SIDES.map((s) => positionRange(ctx.reference.frames, `${s}Tool`)));
  const excess = refR > 0 ? Math.max(0, userR / refR - 1) : 0;
  return {
    id: "handWorkspaceControl",
    score: errorToScore(excess, EXTRA_TOLERANCES.workspaceExcessRatio),
    rawValue: refR > 0 ? userR / refR : 1,
    unit: "ratio",
    tolerance: EXTRA_TOLERANCES.workspaceExcessRatio,
  };
}

// --- Coordination ---

export function bimanualCoordination(ctx: Ctx): MetricResult {
  // Consistency of the left→right relative tip vector vs the reference. Moving both
  // hands together leaves the relative vector unchanged; desyncing one breaks it.
  const err = (s: AlignedSample) => {
    const refRel = {
      x: s.ref.left.tipPosition.x - s.ref.right.tipPosition.x,
      y: s.ref.left.tipPosition.y - s.ref.right.tipPosition.y,
      z: s.ref.left.tipPosition.z - s.ref.right.tipPosition.z,
    };
    const userRel = {
      x: s.user.left.tipPosition.x - s.user.right.tipPosition.x,
      y: s.user.left.tipPosition.y - s.user.right.tipPosition.y,
      z: s.user.left.tipPosition.z - s.user.right.tipPosition.z,
    };
    return dist(refRel, userRel);
  };
  const value = mean(ctx.samples.map(err));
  const w = ctx.samples.length ? worstSample(ctx.samples, err) : undefined;
  return {
    id: "bimanualCoordination",
    score: errorToScore(value, EXTRA_TOLERANCES.relativeTransformUnits),
    rawValue: value,
    unit: "scene-units",
    tolerance: EXTRA_TOLERANCES.relativeTransformUnits,
    segmentId: w?.segmentId,
    evidence: w ? { startMs: w.refTMs } : undefined,
  };
}

// --- Timing & safety ---

function idleFraction(frames: readonly MotionFrame[]): number {
  if (frames.length < 2) return 0;
  let idle = 0;
  for (let i = 1; i < frames.length; i++) {
    const d =
      (dist(frames[i - 1].leftTool.tipPosition, frames[i].leftTool.tipPosition) +
        dist(frames[i - 1].rightTool.tipPosition, frames[i].rightTool.tipPosition)) /
      2;
    if (d < IDLE_SPEED_EPS) idle++;
  }
  return idle / (frames.length - 1);
}

export function idleTimeControl(ctx: Ctx): MetricResult {
  const userIdle = idleFraction(ctx.user.frames);
  const refIdle = idleFraction(ctx.reference.frames);
  const excess = Math.max(0, userIdle - refIdle);
  return {
    id: "idleTimeControl",
    score: errorToScore(excess, EXTRA_TOLERANCES.idleFraction),
    rawValue: userIdle,
    unit: "fraction",
    tolerance: EXTRA_TOLERANCES.idleFraction,
  };
}

export function toolCollisionAvoidance(ctx: Ctx): MetricResult {
  // Tool-tool collisions: user tip pairs closer than the collision radius that the
  // reference keeps apart. (Tool-vs-forbidden-zone collisions arrive with A4.)
  const radius = ctx.scene.collisionRadius ?? DEFAULT_COLLISION_RADIUS;
  const total = ctx.samples.length || 1;
  const userClose = ctx.samples.filter(
    (s) => dist(s.user.left.tipPosition, s.user.right.tipPosition) < radius,
  ).length;
  const refClose = ctx.samples.filter(
    (s) => dist(s.ref.left.tipPosition, s.ref.right.tipPosition) < radius,
  ).length;
  const fraction = Math.max(0, userClose - refClose) / total;
  return {
    id: "toolCollisionAvoidance",
    score: errorToScore(fraction, EXTRA_TOLERANCES.collisionFraction),
    rawValue: fraction,
    unit: "fraction",
    tolerance: EXTRA_TOLERANCES.collisionFraction,
  };
}

export function dangerZoneAvoidance(ctx: Ctx): MetricResult {
  const zones = ctx.scene.dangerZones ?? [];
  if (zones.length === 0) {
    // No forbidden geometry supplied (pre-A4): nothing to violate.
    return {
      id: "dangerZoneAvoidance",
      score: 100,
      rawValue: 0,
      unit: "fraction",
      tolerance: EXTRA_TOLERANCES.dangerFraction,
    };
  }
  const inside = (p: Vec3) => zones.some((z) => dist(p, z.center) <= z.radius);
  const total = ctx.samples.length || 1;
  const violations = ctx.samples.filter(
    (s) => inside(s.user.left.tipPosition) || inside(s.user.right.tipPosition),
  ).length;
  const fraction = violations / total;
  return {
    id: "dangerZoneAvoidance",
    score: errorToScore(fraction, EXTRA_TOLERANCES.dangerFraction),
    rawValue: fraction,
    unit: "fraction",
    tolerance: EXTRA_TOLERANCES.dangerFraction,
  };
}

export const B5_EXTRA_METRICS = [
  depthConsistency,
  motionStability,
  overshootControl,
  correctionEfficiency,
  rotationControlAccuracy,
  pinchStability,
  gripTiming,
  handWorkspaceControl,
  bimanualCoordination,
  idleTimeControl,
  toolCollisionAvoidance,
  dangerZoneAvoidance,
] as const;
