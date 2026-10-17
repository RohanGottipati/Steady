import { motionFrameSchema, referenceMotionSchema, type MotionFrame, type Quat, type ReplayMarker, type ToolState, type Vec3 } from "@/types";
import { lerpVec3, slerpQuat } from "@/lib/exercise/ghost-playback";
import { NEEDLE_PASSING_SEGMENT_ORDER, normalizeQuat, normalizeToolWithGripOffset } from "@/lib/exercise/ghost-reference";
import { composePose, NEEDLE_ID, relativePose } from "./tool-simulation";
import type { ReplayInput, ReplayNeedle, ReplaySceneFrame } from "./replay-types";

export type ReplayMode = "synchronized" | "original";
export type ReplaySpeed = 0.25 | 0.5 | 1;
export type ReplaySmoothing = "recorded" | "centered-7";
type Side = "left" | "right";
type Range = { first: number; last: number };
export interface ReplaySample {
  tMs: number;
  segmentId: string;
  leftTool: ToolState;
  rightTool: ToolState;
  index: number;
  nextIndex: number;
  alpha: number;
}
export interface ReplaySnapshot {
  playing: boolean;
  ended: boolean;
  mode: ReplayMode;
  speed: ReplaySpeed;
  smoothing: ReplaySmoothing;
  showExpert: boolean;
  showPaths: boolean;
  timeMs: number;
  durationMs: number;
  progress: number;
  segmentId: string | null;
  segmentProgress: number;
  user: ReplaySample | null;
  reference: ReplaySample | null;
  needle: ReplayNeedle | null;
  visible: Record<Side, boolean>;
  comparisonAvailable: boolean;
  message: string | null;
  deviations: Record<Side, { distance: number; angleDeg: number } | null>;
}
export interface ReplayTrails {
  user: Record<Side, Vec3[]>;
  reference: Record<Side, Vec3[]>;
}
const sides = ["left", "right"] as const;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const start = (frames: readonly MotionFrame[]) => frames[0]?.tMs ?? 0;
const duration = (frames: readonly MotionFrame[]) => (frames.at(-1)?.tMs ?? 0) - start(frames);
const toolOf = (frame: MotionFrame | ReplaySample, side: Side) => frame[side === "left" ? "leftTool" : "rightTool"];

function copyFrames(input: readonly MotionFrame[]): MotionFrame[] {
  let previous = -Infinity;
  return input.map(candidate => {
    const frame = motionFrameSchema.parse(candidate);
    if (frame.tMs < previous) throw new Error("Replay timestamps must not decrease.");
    previous = frame.tMs;
    for (const side of sides) {
      const tool = toolOf(frame, side);
      const norm = Math.hypot(tool.rotation.x, tool.rotation.y, tool.rotation.z, tool.rotation.w);
      if (tool.id !== `${side}-tool` || !Number.isFinite(norm) || norm < 1e-8) {
        throw new Error("Replay contains an invalid tool identity or rotation.");
      }
    }
    return { tMs: frame.tMs, segmentId: frame.segmentId, normalizedProgress: frame.normalizedProgress,
      leftTool: normalizeToolWithGripOffset(frame.leftTool), rightTool: normalizeToolWithGripOffset(frame.rightTool) };
  });
}
function ranges(frames: readonly MotionFrame[]) {
  const result = new Map<string, Range>();
  const repeated = new Set<string>();
  frames.forEach((frame, index) => {
    const previous = result.get(frame.segmentId);
    if (previous && frames[index - 1]?.segmentId !== frame.segmentId) repeated.add(frame.segmentId);
    result.set(frame.segmentId, { first: previous?.first ?? index, last: index });
  });
  for (const id of repeated) result.delete(id);
  return result;
}
function interpolateTool(a: ToolState, b: ToolState, alpha: number): ToolState {
  return normalizeToolWithGripOffset({ ...a,
    tipPosition: lerpVec3(a.tipPosition, b.tipPosition, alpha), rotation: slerpQuat(a.rotation, b.rotation, alpha) });
}
function atIndex(frames: readonly MotionFrame[], index: number): ReplaySample | null {
  if (!frames.length) return null;
  const p = clamp(index, 0, frames.length - 1);
  const i = Math.floor(p), j = Math.min(i + 1, frames.length - 1), alpha = p - i;
  const a = frames[i], b = frames[j];
  // Discrete states belong to the last observed frame, never the midpoint.
  return { tMs: a.tMs + (b.tMs - a.tMs) * alpha, segmentId: a.segmentId,
    leftTool: interpolateTool(a.leftTool, b.leftTool, alpha), rightTool: interpolateTool(a.rightTool, b.rightTool, alpha),
    index: i, nextIndex: j, alpha };
}
function atTime(frames: readonly MotionFrame[], tMs: number): ReplaySample | null {
  if (!frames.length) return null;
  const t = clamp(tMs, start(frames), frames.at(-1)!.tMs);
  // Upper bound gives deterministic last-observation-wins for equal timestamps.
  let lo = 0, hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].tMs <= t) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1), j = Math.min(i + 1, frames.length - 1);
  const span = frames[j].tMs - frames[i].tMs;
  return atIndex(frames, i + (span > 0 ? (t - frames[i].tMs) / span : 0));
}
const inRange = (sample: ReplaySample, range: Range) => range.last > range.first
  ? clamp((sample.index + sample.alpha - range.first) / (range.last - range.first), 0, 1) : sample.segmentId === "complete" ? 1 : 0;

function averageRotation(quats: Quat[]): Quat {
  const anchor = quats[0];
  const sum = { x: 0, y: 0, z: 0, w: 0 };
  for (const q of quats) {
    const sign = anchor.x * q.x + anchor.y * q.y + anchor.z * q.z + anchor.w * q.w < 0 ? -1 : 1;
    sum.x += sign * q.x; sum.y += sign * q.y; sum.z += sign * q.z; sum.w += sign * q.w;
  }
  return normalizeQuat(sum);
}
function smooth(frames: readonly MotionFrame[], scene?: readonly ReplaySceneFrame[]): MotionFrame[] {
  const sameRun = (a: number, b: number) => frames[a].segmentId === frames[b].segmentId
    && scene?.[a]?.needle.heldBy === scene?.[b]?.needle.heldBy
    && sides.every(side => toolOf(frames[a], side).jawClosed === toolOf(frames[b], side).jawClosed
      && toolOf(frames[a], side).heldObjectId === toolOf(frames[b], side).heldObjectId
      && scene?.[a]?.visible[side] === scene?.[b]?.visible[side]);
  return frames.map((frame, index) => {
    if (!index || index === frames.length - 1 || !sameRun(index, index - 1) || !sameRun(index, index + 1)) return frame;
    let radius = 0;
    while (radius < 3 && index - radius - 1 >= 0 && index + radius + 1 < frames.length
      && sameRun(index, index - radius - 1) && sameRun(index, index + radius + 1)) radius++;
    if (!radius) return frame;
    const tools = (side: Side) => {
      const window = frames.slice(index - radius, index + radius + 1).map(f => toolOf(f, side));
      const tipPosition = { x: 0, y: 0, z: 0 };
      for (const tool of window) { tipPosition.x += tool.tipPosition.x / window.length;
        tipPosition.y += tool.tipPosition.y / window.length; tipPosition.z += tool.tipPosition.z / window.length; }
      return normalizeToolWithGripOffset({ ...toolOf(frame, side), tipPosition, rotation: averageRotation(window.map(t => t.rotation)) });
    };
    return { ...frame, leftTool: tools("left"), rightTool: tools("right") };
  });
}
/** Independent line segments, with no connector across hidden tool observations. */
function trail(frames: readonly MotionFrame[], side: Side, scene?: readonly ReplaySceneFrame[]): Vec3[] {
  const stride = Math.max(1, Math.ceil(frames.length / 500));
  const path: Vec3[] = [];
  let previous = -1;
  frames.forEach((frame, index) => {
    if (scene && !scene[index].visible[side]) { previous = -1; return; }
    if (previous < 0) { previous = index; return; }
    if (index % stride === 0 || index === frames.length - 1 || frames[index + 1]?.segmentId !== frame.segmentId) {
      path.push({ ...toolOf(frames[previous], side).tipPosition }, { ...toolOf(frame, side).tipPosition });
      previous = index;
    }
  });
  return path;
}
function angle(a: Quat, b: Quat) {
  return 2 * Math.acos(clamp(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w), 0, 1)) * 180 / Math.PI;
}

/** Display-only, deterministic replay. Never feeds smoothed data into scoring. */
export class ReplayController {
  private readonly userFrames: MotionFrame[];
  private readonly referenceFrames: MotionFrame[];
  private readonly sceneFrames?: ReplaySceneFrame[];
  private readonly userRanges: Map<string, Range>;
  private readonly referenceRanges: Map<string, Range>;
  private smoothedUser?: MotionFrame[];
  private smoothedReference?: MotionFrame[];
  private trails: ReplayTrails;
  private playing = false;
  private timeMs = 0;
  private mode: ReplayMode = "synchronized";
  private speed: ReplaySpeed = 1;
  private smoothing: ReplaySmoothing = "recorded";
  private showExpert = true;
  private showPaths = true;
  private markerAlignment: { userIndex: number; segmentId: string; u: number } | null = null;
  snapshot: ReplaySnapshot;

  constructor(input: ReplayInput) {
    if (input.truncated) throw new Error("This recording was truncated. Record a new attempt for complete replay.");
    const reference = referenceMotionSchema.parse(input.reference);
    if (reference.skillId !== input.skillId) throw new Error("Replay and reference must use the same skill.");
    this.userFrames = copyFrames(input.userFrames);
    this.referenceFrames = copyFrames(reference.frames);
    let lastRank = -1;
    for (const frame of this.referenceFrames) {
      const rank = NEEDLE_PASSING_SEGMENT_ORDER.indexOf(frame.segmentId as typeof NEEDLE_PASSING_SEGMENT_ORDER[number]);
      if (rank < lastRank || rank < 0) throw new Error("Replay requires a single canonical Needle Passing reference.");
      lastRank = rank;
    }
    if (input.sceneFrames) {
      if (input.sceneFrames.length !== this.userFrames.length) throw new Error("Replay scene frames must match the motion recording.");
      for (const frame of input.sceneFrames) {
        const needle = frame.needle;
        if (!needle || ![needle.position.x, needle.position.y, needle.position.z,
          needle.rotation.x, needle.rotation.y, needle.rotation.z, needle.rotation.w].every(Number.isFinite)
          || !Number.isFinite(Math.hypot(needle.rotation.x, needle.rotation.y, needle.rotation.z, needle.rotation.w))
          || Math.hypot(needle.rotation.x, needle.rotation.y, needle.rotation.z, needle.rotation.w) < 1e-8
          || ![null, "left-tool", "right-tool"].includes(needle.heldBy)
          || typeof frame.visible?.left !== "boolean" || typeof frame.visible?.right !== "boolean") {
          throw new Error("Replay contains invalid needle or visibility data.");
        }
      }
      this.sceneFrames = structuredClone(input.sceneFrames) as ReplaySceneFrame[];
    }
    this.userRanges = ranges(this.userFrames);
    this.referenceRanges = ranges(this.referenceFrames);
    this.trails = this.buildTrails();
    this.snapshot = this.sample();
  }
  private get user() { return this.smoothing === "centered-7" ? this.smoothedUser! : this.userFrames; }
  private get reference() { return this.smoothing === "centered-7" ? this.smoothedReference! : this.referenceFrames; }
  private get durationMs() { return this.mode === "original" ? Math.max(duration(this.userFrames), duration(this.referenceFrames)) : duration(this.userFrames); }
  private buildTrails(): ReplayTrails {
    return { user: { left: trail(this.user, "left", this.sceneFrames), right: trail(this.user, "right", this.sceneFrames) },
      reference: { left: trail(this.reference, "left"), right: trail(this.reference, "right") } };
  }
  getTrails(): ReplayTrails { return this.trails; }
  /** Initial review position: three seconds before confirmed needle ownership.
   * Scene state is authoritative when present; older tool-only recordings use
   * held-object IDs. Closing empty jaws is never a pickup signal.
   */
  seekToTaskStart() {
    const index = this.sceneFrames
      ? this.sceneFrames.findIndex(frame => frame.needle.id === NEEDLE_ID && frame.needle.heldBy !== null)
      : this.userFrames.findIndex(frame => frame.leftTool.heldObjectId === NEEDLE_ID || frame.rightTool.heldObjectId === NEEDLE_ID);
    const time = index >= 0 ? this.userFrames[index].tMs - start(this.userFrames) - 3000 : 0;
    this.seekTime(Math.max(0, time));
  }
  play() {
    if (!this.userFrames.length || this.durationMs <= 0) return;
    if (this.timeMs >= this.durationMs) this.timeMs = 0;
    this.markerAlignment = null;
    this.playing = true; this.refresh();
  }
  pause() { this.playing = false; this.refresh(); }
  seekTime(tMs: number) {
    if (!Number.isFinite(tMs)) return;
    this.markerAlignment = null;
    this.timeMs = clamp(tMs, 0, this.durationMs); this.pause();
  }
  seekProgress(progress: number) { if (Number.isFinite(progress)) this.seekTime(clamp(progress, 0, 1) * this.durationMs); }
  /** Markers use reference timestamps; return false when the segment is absent. */
  seekMarker(marker: ReplayMarker): boolean {
    if (!Number.isFinite(marker.tMs)) return false;
    const refRange = this.referenceRanges.get(marker.segmentId), userRange = this.userRanges.get(marker.segmentId);
    if (!refRange || !userRange) return false;
    const ref = atTime(this.referenceFrames, clamp(marker.tMs, this.referenceFrames[refRange.first].tMs, this.referenceFrames[refRange.last].tMs));
    if (!ref) return false;
    const u = inRange(ref, refRange);
    const user = atIndex(this.userFrames, userRange.first + (userRange.last - userRange.first) * u)!;
    this.mode = "synchronized";
    this.seekTime(user.tMs - start(this.userFrames));
    // A one-frame user segment (or equal timestamps) cannot encode arbitrary
    // reference progress in its clock. Preserve the exact issue pose while paused.
    this.markerAlignment = { userIndex: userRange.first + (userRange.last - userRange.first) * u, segmentId: marker.segmentId, u };
    this.refresh();
    return true;
  }
  setSpeed(speed: ReplaySpeed) { if ([0.25, 0.5, 1].includes(speed)) { this.speed = speed; this.refresh(); } }
  setMode(mode: ReplayMode) {
    if (mode !== "original" && mode !== "synchronized") return;
    this.markerAlignment = null;
    this.mode = mode; this.timeMs = Math.min(this.timeMs, this.durationMs); this.pause();
  }
  setSmoothing(smoothing: ReplaySmoothing) {
    if (smoothing !== "recorded" && smoothing !== "centered-7") return;
    if (smoothing === this.smoothing) return;
    if (smoothing === "centered-7") {
      this.smoothedUser ??= smooth(this.userFrames, this.sceneFrames);
      this.smoothedReference ??= smooth(this.referenceFrames);
    }
    this.smoothing = smoothing; this.trails = this.buildTrails(); this.refresh();
  }
  setShowExpert(visible: boolean) { this.showExpert = visible; this.refresh(); }
  setShowPaths(visible: boolean) { this.showPaths = visible; this.refresh(); }
  update(deltaSeconds: number): ReplaySnapshot {
    if (this.playing && Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
      this.timeMs = Math.min(this.durationMs, this.timeMs + deltaSeconds * 1000 * this.speed);
      if (this.timeMs >= this.durationMs) this.playing = false;
      this.refresh();
    }
    return this.snapshot;
  }
  private refresh() { this.snapshot = this.sample(); }
  private sample(): ReplaySnapshot {
    const user = this.markerAlignment ? atIndex(this.user, this.markerAlignment.userIndex) : atTime(this.user, start(this.user) + this.timeMs);
    const range = user ? this.userRanges.get(user.segmentId) : undefined;
    const u = this.markerAlignment?.u ?? (user && range ? inRange(user, range) : 0);
    const refRange = user && range ? this.referenceRanges.get(user.segmentId) : undefined;
    const reference = this.mode === "original" ? atTime(this.reference, start(this.reference) + this.timeMs)
      : refRange ? atIndex(this.reference, refRange.first + (refRange.last - refRange.first) * u) : null;
    const scene = user ? this.sceneFrames?.[user.index] : undefined;
    const visible = scene?.visible ?? { left: true, right: true };
    let needle: ReplayNeedle | null = null;
    if (scene && user) {
      const nextScene = this.sceneFrames![user.nextIndex];
      const owner = scene.needle.heldBy;
      if (owner) {
        const side = owner === "left-tool" ? "left" : "right";
        const local = relativePose(toolOf(this.userFrames[user.index], side), scene.needle);
        needle = { ...composePose(toolOf(user, side), local), heldBy: owner };
      } else {
        const sameOwner = nextScene.needle.heldBy === owner;
        needle = { position: sameOwner ? lerpVec3(scene.needle.position, nextScene.needle.position, user.alpha) : { ...scene.needle.position },
          rotation: sameOwner ? slerpQuat(scene.needle.rotation, nextScene.needle.rotation, user.alpha) : normalizeQuat(scene.needle.rotation), heldBy: null };
      }
    }
    const compare = (side: Side) => {
      if (!user || !reference || !visible[side]) return null;
      const a = toolOf(user, side), b = toolOf(reference, side);
      return { distance: Math.hypot(a.tipPosition.x - b.tipPosition.x, a.tipPosition.y - b.tipPosition.y, a.tipPosition.z - b.tipPosition.z),
        angleDeg: angle(a.rotation, b.rotation) };
    };
    return { playing: this.playing, ended: this.timeMs >= this.durationMs, mode: this.mode, speed: this.speed,
      smoothing: this.smoothing, showExpert: this.showExpert, showPaths: this.showPaths,
      timeMs: this.timeMs, durationMs: this.durationMs, progress: this.durationMs > 0 ? this.timeMs / this.durationMs : 0,
      segmentId: user?.segmentId ?? null, segmentProgress: u, user, reference, needle, visible: { ...visible },
      comparisonAvailable: !!(user && reference), deviations: { left: compare("left"), right: compare("right") },
      message: !user ? "No recorded motion is available." : !reference ? "Reference comparison is unavailable for this segment."
        : !scene ? "Tool-only recording: needle state is unavailable." : null };
  }
}
