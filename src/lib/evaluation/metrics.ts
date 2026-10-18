import type { MetricResult } from "@/types/evaluation";
import type { MotionFrame } from "@/types/motion";
import type { AlignedSample } from "./align";
import type { MetricContext } from "./context";
import { errorToScore, pathLength, quatAngleDeg, tipDistance } from "./score";

// B3 default tolerances in canonical scene units / degrees. Skill-specific
// tuning (via SkillDefinition) comes later; these keep scoring deterministic.
export const TOLERANCES = {
  positionUnits: 0.15,
  orientationDeg: 30,
  pathExcessRatio: 0.5, // 50% longer than reference -> 0
  jerk: 0.02,
  speedShape: 0.35,
  timingRatio: 0.5,
} as const;

type Ctx = MetricContext;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function pairTipDist(s: AlignedSample): number {
  return (
    (tipDistance(s.ref.left.tipPosition, s.user.left.tipPosition) +
      tipDistance(s.ref.right.tipPosition, s.user.right.tipPosition)) /
    2
  );
}

function pairAngle(s: AlignedSample): number {
  return (
    (quatAngleDeg(s.ref.left.rotation, s.user.left.rotation) +
      quatAngleDeg(s.ref.right.rotation, s.user.right.rotation)) /
    2
  );
}

function tipPath(frames: readonly MotionFrame[], side: "leftTool" | "rightTool") {
  return pathLength(frames.map((f) => f[side].tipPosition));
}

function jerkMagnitude(frames: readonly MotionFrame[], side: "leftTool" | "rightTool"): number {
  const p = frames.map((f) => f[side].tipPosition);
  if (p.length < 4) return 0;
  const mags: number[] = [];
  for (let i = 3; i < p.length; i++) {
    // third finite difference (discrete jerk) magnitude
    const jx = p[i].x - 3 * p[i - 1].x + 3 * p[i - 2].x - p[i - 3].x;
    const jy = p[i].y - 3 * p[i - 1].y + 3 * p[i - 2].y - p[i - 3].y;
    const jz = p[i].z - 3 * p[i - 1].z + 3 * p[i - 2].z - p[i - 3].z;
    mags.push(Math.hypot(jx, jy, jz));
  }
  return mean(mags);
}

function normalizedSpeedCurve(samples: AlignedSample[], which: "ref" | "user"): number[] {
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].segmentId !== samples[i - 1].segmentId) {
      speeds.push(0);
      continue;
    }
    const a = samples[i - 1][which];
    const b = samples[i][which];
    const d = (tipDistance(a.left.tipPosition, b.left.tipPosition) +
      tipDistance(a.right.tipPosition, b.right.tipPosition)) / 2;
    speeds.push(d);
  }
  const max = Math.max(...speeds, 1e-9);
  return speeds.map((s) => s / max);
}

/** Attribute each observed interval to the stage active until the next frame.
 * Single-frame stages retain their duration; revisits do not include other stages.
 * Recording timestamps already exclude tracking suspension time. */
function segmentDurations(frames: readonly MotionFrame[]): Map<string, number> {
  const durations = new Map<string, number>();
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1];
    const duration = Math.max(0, frames[i].tMs - previous.tMs);
    durations.set(previous.segmentId, (durations.get(previous.segmentId) ?? 0) + duration);
  }
  return durations;
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
  return { sample: best, value: bestV };
}

export function pathSimilarity(ctx: Ctx): MetricResult {
  const d = ctx.samples.map(pairTipDist);
  const w = worstSample(ctx.samples, pairTipDist);
  return {
    id: "pathSimilarity",
    score: errorToScore(mean(d), TOLERANCES.positionUnits),
    rawValue: mean(d),
    unit: "scene-units",
    tolerance: TOLERANCES.positionUnits,
    evidence: { startMs: w.sample.refTMs },
    segmentId: w.sample.segmentId,
  };
}

export function targetAccuracy(ctx: Ctx): MetricResult {
  // Compare at the end (u === 1) of each segment: grip/entry/exit/release targets.
  const ends = ctx.samples.filter((s) => s.u === 1);
  const d = ends.map(pairTipDist);
  const w = ends.length ? worstSample(ends, pairTipDist) : worstSample(ctx.samples, pairTipDist);
  return {
    id: "targetAccuracy",
    score: errorToScore(mean(d), TOLERANCES.positionUnits),
    rawValue: mean(d),
    unit: "scene-units",
    tolerance: TOLERANCES.positionUnits,
    evidence: { startMs: w.sample.refTMs },
    segmentId: w.sample.segmentId,
  };
}

export function instrumentOrientationAccuracy(ctx: Ctx): MetricResult {
  const a = ctx.samples.map(pairAngle);
  const w = worstSample(ctx.samples, pairAngle);
  return {
    id: "instrumentOrientationAccuracy",
    score: errorToScore(mean(a), TOLERANCES.orientationDeg),
    rawValue: mean(a),
    unit: "deg",
    tolerance: TOLERANCES.orientationDeg,
    evidence: { startMs: w.sample.refTMs },
    segmentId: w.sample.segmentId,
  };
}

export function pathEfficiency(ctx: Ctx): MetricResult {
  const refLen = (tipPath(ctx.reference.frames, "leftTool") + tipPath(ctx.reference.frames, "rightTool")) / 2;
  const userLen = (tipPath(ctx.user.frames, "leftTool") + tipPath(ctx.user.frames, "rightTool")) / 2;
  const excess = refLen > 0 ? Math.max(0, userLen / refLen - 1) : 0;
  return {
    id: "pathEfficiency",
    score: errorToScore(excess, TOLERANCES.pathExcessRatio),
    rawValue: refLen > 0 ? userLen / refLen : 1,
    unit: "ratio",
    tolerance: TOLERANCES.pathExcessRatio,
  };
}

export function movementSmoothness(ctx: Ctx): MetricResult {
  const refJerk = (jerkMagnitude(ctx.reference.frames, "leftTool") + jerkMagnitude(ctx.reference.frames, "rightTool")) / 2;
  const userJerk = (jerkMagnitude(ctx.user.frames, "leftTool") + jerkMagnitude(ctx.user.frames, "rightTool")) / 2;
  const excess = Math.max(0, userJerk - refJerk);
  return {
    id: "movementSmoothness",
    score: errorToScore(excess, TOLERANCES.jerk),
    rawValue: userJerk,
    unit: "jerk",
    tolerance: TOLERANCES.jerk,
  };
}

export function speedProfileControl(ctx: Ctx): MetricResult {
  const refS = normalizedSpeedCurve(ctx.samples, "ref");
  const userS = normalizedSpeedCurve(ctx.samples, "user");
  const diffs = refS.map((r, i) => Math.abs(r - (userS[i] ?? 0)));
  return {
    id: "speedProfileControl",
    score: errorToScore(mean(diffs), TOLERANCES.speedShape),
    rawValue: mean(diffs),
    unit: "normalized",
    tolerance: TOLERANCES.speedShape,
  };
}

export function segmentTiming(ctx: Ctx): MetricResult {
  const refDur = segmentDurations(ctx.reference.frames);
  const userDur = segmentDurations(ctx.user.frames);
  const refTotal = [...refDur.values()].reduce((sum, duration) => sum + duration, 0);
  const userTotal = [...userDur.values()].reduce((sum, duration) => sum + duration, 0);
  // Compare time allocation, not the absolute speed of the short synthetic guide.
  // Total variation is the fraction of attempt time redistributed between stages.
  let difference = 0;
  if (refTotal > 0) {
    if (userTotal <= 0) difference = 1;
    else {
      const ids = new Set([...refDur.keys(), ...userDur.keys()]);
      for (const id of ids) {
        difference += Math.abs((userDur.get(id) ?? 0) / userTotal - (refDur.get(id) ?? 0) / refTotal) / 2;
      }
    }
  }
  return {
    id: "segmentTiming",
    score: errorToScore(difference, TOLERANCES.timingRatio),
    rawValue: difference,
    unit: "fraction",
    tolerance: TOLERANCES.timingRatio,
  };
}

// Collapse consecutive duplicate segment ids into runs, preserving order and any
// legitimate revisits (real procedures repeat gestures, e.g. four needle passes).
function runCollapse(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (out[out.length - 1] !== id) out.push(id);
  return out;
}

// Longest common subsequence length — order-sensitive and repeat-safe.
function lcsLength(a: readonly string[], b: readonly string[]): number {
  const n = b.length;
  const dp = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function proceduralSequencing(ctx: Ctx): MetricResult {
  // Compare the reference's run-collapsed segment sequence (which may legitimately
  // revisit gestures) against the user's via LCS. A perfect clone matches exactly
  // (ratio 1); reordering, skipping, or looping gestures out of order lowers it.
  const refSeq = ctx.reference.segments.map((s) => s.id);
  const userSeq = runCollapse(ctx.user.frames.map((f) => f.segmentId));
  const total = refSeq.length;
  const ratio = total ? lcsLength(refSeq, userSeq) / total : 1;
  return {
    id: "proceduralSequencing",
    score: Math.round(100 * ratio),
    rawValue: ratio,
    unit: "ratio",
  };
}

export const B3_METRICS = [
  pathSimilarity,
  targetAccuracy,
  instrumentOrientationAccuracy,
  pathEfficiency,
  movementSmoothness,
  speedProfileControl,
  segmentTiming,
  proceduralSequencing,
] as const;
