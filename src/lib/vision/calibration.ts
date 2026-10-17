import { Quaternion } from "three";
import type { TrackingSnapshot } from "./types";
import { CONTROL_TIMING, HAND_SLOTS, type CalibrationProfile, type CalibrationState, type HandCalibration, type HandSlot, type VideoDimensions } from "./control-types";
import { clamp, measureHand, plainQuat, quaternion, type HandMeasurement } from "./hand-geometry";
import { WorkspaceCalibration } from "./workspace-calibration";

export const CALIBRATION_TIMING = { neutralMs: 750, pinchMs: 750, workspaceMs: 1500, timeoutMs: 15_000, workspaceTimeoutMs: 45_000 } as const;
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};
const median = (values: number[]) => quantile(values, 0.5);
const prompts = {
  neutral: "Hold both open hands still in a comfortable neutral position.",
  pinch: "Pinch thumb and index finger together on both hands and hold.",
  workspace: "Keep both palms open toward the camera. Move one hand at a time and follow the unchecked arrows.",
};
type Pair<T> = Record<HandSlot, T>;
const emptySamples = (): Pair<HandMeasurement[]> => ({ left: [], right: [] });

function aggregate(samples: HandMeasurement[]): HandMeasurement {
  const reference = quaternion(samples[0].rotation);
  const sum = new Quaternion(0, 0, 0, 0);
  for (const sample of samples) {
    const q = quaternion(sample.rotation);
    const sign = reference.dot(q) < 0 ? -1 : 1;
    sum.set(sum.x + sign * q.x, sum.y + sign * q.y, sum.z + sign * q.z, sum.w + sign * q.w);
  }
  return {
    center: { x: median(samples.map(s => s.center.x)), y: median(samples.map(s => s.center.y)), z: median(samples.map(s => s.center.z)) },
    rotation: plainQuat(sum.normalize()),
    palmScale: median(samples.map(s => s.palmScale)),
    pinchRatio: median(samples.map(s => s.pinchRatio)),
  };
}

/** Pure calibration state machine. Only distinct, recent detector frames count. */
export class HandCalibrationController {
  state: CalibrationState = { stage: "idle", progress: 0, message: "Start the camera, then calibrate controls." };
  profile: CalibrationProfile | null = null;
  private dimensions: VideoDimensions = { width: 0, height: 0 };
  private samples = emptySamples();
  private neutral: Pair<HandMeasurement> | null = null;
  private closed: Pair<number> | null = null;
  private windowStart: number | null = null;
  private lastSample: number | null = null;
  private lastSource = -Infinity;
  private lastClock: number | null = null;
  private elapsed = 0;
  private workspace: WorkspaceCalibration | null = null;

  reset(message = "Start the camera, then calibrate controls.") {
    this.profile = null;
    this.state = { stage: "idle", progress: 0, message };
    this.samples = emptySamples(); this.neutral = null; this.closed = null;
    this.workspace = null;
    this.lastSource = -Infinity; this.lastClock = null; this.elapsed = 0;
    this.clearWindow();
  }

  start(nowMs: number, size: VideoDimensions) {
    this.reset(); this.dimensions = { ...size };
    this.enter("neutral"); this.lastClock = nowMs; this.lastSource = nowMs;
  }

  suspend() {
    this.lastClock = null;
    if (this.state.stage === "workspace") HAND_SLOTS.forEach(slot => this.workspace?.interrupt(slot));
    else if (["neutral", "pinch"].includes(this.state.stage)) this.clearWindow();
  }

  retryWorkspace(nowMs: number) {
    if (this.state.stage !== "error" || this.state.retryStage !== "workspace" || !this.workspace) return false;
    this.enter("workspace"); this.lastClock = nowMs; this.lastSource = nowMs;
    HAND_SLOTS.forEach(slot => this.workspace!.interrupt(slot));
    this.workspaceState();
    return true;
  }
  private clearWindow() {
    this.samples = emptySamples(); this.windowStart = null; this.lastSample = null;
    this.state = { ...this.state, progress: 0 };
  }
  private enter(stage: "neutral" | "pinch" | "workspace") {
    this.state = { stage, progress: 0, message: prompts[stage] };
    this.clearWindow(); this.elapsed = 0;
  }

  tick(nowMs: number) {
    if (!["neutral", "pinch", "workspace"].includes(this.state.stage) || !Number.isFinite(nowMs)) return;
    if (this.lastClock !== null && nowMs >= this.lastClock) this.elapsed += nowMs - this.lastClock;
    this.lastClock = nowMs;
    const workspace = this.state.stage === "workspace";
    const timeout = workspace ? CALIBRATION_TIMING.workspaceTimeoutMs : CALIBRATION_TIMING.timeoutMs;
    if (workspace) this.state = { ...this.state, secondsRemaining: Math.ceil((timeout - this.elapsed) / 1000) };
    if (this.elapsed >= timeout) {
      if (workspace) {
        this.state = { ...this.state, stage: "error", retryStage: "workspace", secondsRemaining: 0,
          message: "Workspace capture timed out. Retry workspace to keep your completed arrows and open/pinch calibration, or start over." };
        return;
      }
      this.clearWindow();
      this.state = { stage: "error", progress: 0, message: "Calibration timed out. Keep both hands visible in good lighting and retry calibration." };
    }
  }

  update(snapshot: TrackingSnapshot, nowMs: number) {
    const stage = this.state.stage;
    if (stage !== "neutral" && stage !== "pinch" && stage !== "workspace") return;
    if (!Number.isFinite(snapshot.tMs) || snapshot.tMs <= this.lastSource || snapshot.tMs > nowMs) return;
    this.lastSource = snapshot.tMs;
    if (stage === "workspace") { this.captureWorkspace(snapshot, nowMs); return; }
    const measured = HAND_SLOTS.map(slot => snapshot[slot] ? measureHand(snapshot[slot]!, this.dimensions) : null);
    if (nowMs - snapshot.tMs > CONTROL_TIMING.freshnessMs || measured.some(m => !m) ||
      HAND_SLOTS.some(slot => snapshot[slot]!.handednessConfidence < 0.75 || snapshot[slot]!.handedness !== (slot === "left" ? "Left" : "Right"))) {
      this.clearWindow();
      this.state = { ...this.state, message: "Keep both hands fully visible with clear left/right labels. " + prompts[stage] };
      return;
    }
    const pair = { left: measured[0]!, right: measured[1]! };
    const poseValid = HAND_SLOTS.every(slot => {
      const m = pair[slot];
      if (stage === "neutral") return m.pinchRatio >= 0.55;
      const open = this.neutral![slot].pinchRatio;
      return m.pinchRatio <= Math.min(0.5, open - 0.15);
    });
    if (!poseValid) { this.clearWindow(); this.state = { ...this.state, message: prompts[stage] }; return; }
    if (this.lastSample !== null && snapshot.tMs - this.lastSample > CONTROL_TIMING.maxSampleGapMs) this.clearWindow();
    if (HAND_SLOTS.some(slot => {
      const first = this.samples[slot][0], m = pair[slot];
      return first && (Math.hypot((m.center.x - first.center.x) * this.dimensions.width / this.dimensions.height, m.center.y - first.center.y) > 0.025 ||
        Math.abs(m.palmScale / first.palmScale - 1) > 0.15 || quaternion(first.rotation).angleTo(quaternion(m.rotation)) > Math.PI / 12);
    })) this.clearWindow();
    this.windowStart ??= snapshot.tMs;
    this.lastSample = snapshot.tMs;
    HAND_SLOTS.forEach(slot => {
      this.samples[slot].push(pair[slot]);
      // Bound memory even at unexpectedly high detector rates.
      if (this.samples[slot].length > 512) this.samples[slot].shift();
    });
    const duration = CALIBRATION_TIMING[`${stage}Ms`];
    this.state = { stage, progress: clamp((snapshot.tMs - this.windowStart) / duration, 0, 0.99), message: prompts[stage] };
    if (snapshot.tMs - this.windowStart < duration || this.samples.left.length < 10) return;
    if (stage === "neutral") {
      this.neutral = { left: aggregate(this.samples.left), right: aggregate(this.samples.right) };
      this.enter("pinch");
    } else if (stage === "pinch") {
      this.closed = { left: median(this.samples.left.map(m => m.pinchRatio)), right: median(this.samples.right.map(m => m.pinchRatio)) };
      this.workspace = new WorkspaceCalibration(this.neutral!, this.dimensions);
      this.enter("workspace");
      this.workspaceState();
    }
  }

  private workspaceState(message?: string) {
    const progress = this.workspace!.progress();
    const next = this.workspace!.next();
    const prompt = next ? `Move your ${next.slot} hand ${next.direction} in the mirrored preview, then hold briefly until that arrow is checked.`
      : "Keep both open hands visible briefly to finish.";
    this.state = { stage: "workspace", progress: Math.min(0.99, Object.values(progress).flatMap(Object.values).reduce((sum, value) => sum + value, 0) / 8),
      message: message ?? prompt, workspace: progress, secondsRemaining: Math.ceil((CALIBRATION_TIMING.workspaceTimeoutMs - this.elapsed) / 1000) };
  }

  private captureWorkspace(snapshot: TrackingSnapshot, nowMs: number) {
    const problems: string[] = [];
    for (const slot of HAND_SLOTS) {
      const hand = snapshot[slot];
      let measurement = hand && hand.handedness === (slot === "left" ? "Left" : "Right") && hand.handednessConfidence >= 0.75 &&
        nowMs - snapshot.tMs <= CONTROL_TIMING.freshnessMs ? measureHand(hand, this.dimensions) : null;
      if (!measurement) problems.push(`Keep your ${slot} hand visible, palm facing the camera.`);
      else if (measurement.pinchRatio <= this.closed![slot] + 0.4 * (this.neutral![slot].pinchRatio - this.closed![slot])) {
        measurement = null; problems.push(`Open your ${slot} hand: separate thumb and index finger.`);
      }
      this.workspace!.update(slot, measurement, snapshot.tMs);
    }
    this.workspaceState(problems.length ? `${problems.join(" ")} Completed arrows are saved.` : undefined);
    if (problems.length === 0 && this.workspace!.ready(CALIBRATION_TIMING.workspaceMs)) {
      const hands = {} as Pair<HandCalibration>;
      for (const slot of HAND_SLOTS) {
        const neutral = this.neutral![slot], closed = this.closed![slot];
        const range = this.workspace!.range(slot);
        hands[slot] = {
          neutralCenter: { ...neutral.center }, neutralRotation: { ...neutral.rotation }, palmScale: neutral.palmScale,
          openPinchRatio: neutral.pinchRatio, closedPinchRatio: closed,
          enterPinchRatio: closed + 0.28 * (neutral.pinchRatio - closed),
          releasePinchRatio: closed + 0.4 * (neutral.pinchRatio - closed), range,
        };
      }
      this.profile = { dimensions: { ...this.dimensions }, ...hands };
      this.state = { stage: "ready", progress: 1, message: "Calibration ready. Move, rotate and pinch to inspect both control targets." };
      this.samples = emptySamples();
    }
  }
}
