import type { MetricResult } from "@/types/evaluation";
import type { MotionFrame } from "@/types/motion";
import type { AlignedSample } from "./align";
import { segmentOrder } from "./align";
import { errorToScore, pathLength, quatAngleDeg, tipDistance } from "./score";
import type { RecordedMotion } from "./types";

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

type Ctx = {
  samples: AlignedSample[];
  reference: { frames: readonly MotionFrame[]; segments: readonly { id: string }[] };
  user: RecordedMotion;
};

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

function segmentDurations(frames: readonly MotionFrame[]): Map<string, number> {
  const by = new Map<string, { min: number; max: number }>();
  for (const f of frames) {
    const cur = by.get(f.segmentId);
    if (!cur) by.set(f.segmentId, { min: f.tMs, max: f.tMs });
    else {
      cur.min = Math.min(cur.min, f.tMs);
      cur.max = Math.max(cur.max, f.tMs);
    }
  }
  const out = new Map<string, number>();
  for (const [id, { min, max }] of by) out.set(id, max - min);
  return out;
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
  const errs: number[] = [];
  for (const [id, rd] of refDur) {
    if (rd <= 0) continue;
    const ud = userDur.get(id) ?? 0;
    errs.push(Math.abs(ud - rd) / rd);
  }
  return {
    id: "segmentTiming",
    score: errorToScore(mean(errs), TOLERANCES.timingRatio),
    rawValue: mean(errs),
    unit: "relative",
    tolerance: TOLERANCES.timingRatio,
  };
}

export function proceduralSequencing(ctx: Ctx): MetricResult {
  const refOrder = ctx.reference.segments.map((s) => s.id);
  const userOrder = segmentOrder(ctx.user.frames);
  const rank = new Map(userOrder.map((id, i) => [id, i]));
  let correct = 0;
  let total = 0;
  for (let i = 1; i < refOrder.length; i++) {
    const a = rank.get(refOrder[i - 1]);
    const b = rank.get(refOrder[i]);
    total++;
    if (a !== undefined && b !== undefined && a < b) correct++;
  }
  const ratio = total ? correct / total : 1;
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
