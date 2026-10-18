import { Quaternion } from "three";
import type { TrackingSnapshot } from "./types";
import { CONTROL_TIMING, HAND_SLOTS, USE_SURGICAL_POSTURE_MAPPING, type CalibrationProfile, type CalibrationState, type HandCalibration, type HandSlot, type VideoDimensions } from "./control-types";
import { clamp, measureHand, plainQuat, quaternion, type HandMeasurement } from "./hand-geometry";
import { WorkspaceCalibration } from "./workspace-calibration";

export const CALIBRATION_TIMING = { neutralMs: 750, pinchMs: 750, workspaceMs: 1500, timeoutMs: 15_000, workspaceTimeoutMs: 45_000 } as const;
export const NEUTRAL_MINIMUM_FRAMES = 30;
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};
const median = (values: number[]) => quantile(values, 0.5);
const prompts = {
  neutral: "Place both hands naturally above your desk as if holding surgical instruments. Keep your palms mostly downward and slightly inward. Relax your wrists, keep thumb and index slightly apart, and hold still while we calibrate your neutral position.",
  pinch: "Pinch thumb and index finger together on both hands and hold.",
  workspace: "Keep your palms mostly downward and slightly inward, with thumb and index apart. Move one hand at a time and follow the unchecked arrows above your desk.",
};
const legacyPrompts = { ...prompts, neutral: "Hold both open hands still in a comfortable neutral position.", workspace: "Keep both palms open toward the camera. Move one hand at a time and follow the unchecked arrows." };
type Pair<T> = Record<HandSlot, T>;
const emptySamples = (): Pair<HandMeasurement[]> => ({ left: [], right: [] });

function aggregate(samples: HandMeasurement[], spherical = false): HandMeasurement {
  const reference = quaternion(samples[0].rotation);
  const sum = new Quaternion(0, 0, 0, 0);
  for (const [index, sample] of samples.entries()) {
    const q = quaternion(sample.rotation);
    const sign = reference.dot(q) < 0 ? -1 : 1;
    q.set(q.x * sign, q.y * sign, q.z * sign, q.w * sign);
    if (spherical) reference.slerp(q, 1 / (index + 1));
    else sum.set(sum.x + q.x, sum.y + q.y, sum.z + q.z, sum.w + q.w);
  }
  return {
    center: { x: median(samples.map(s => s.center.x)), y: median(samples.map(s => s.center.y)), z: median(samples.map(s => s.center.z)) },
    rotation: plainQuat((spherical ? reference : sum).normalize()),
    palmScale: median(samples.map(s => s.palmScale)),
    pinchRatio: median(samples.map(s => s.pinchRatio)),
  };
}

/** Shared guided/quick neutral sampler. Completed hands survive the other
 * hand's interruptions; incomplete windows must remain continuously stable. */
export class NeutralPoseCapture {
  private samples: HandMeasurement[] = [];
  private start: number | null = null;
  private lastSample: number | null = null;
  private lastSource = -Infinity;
  result: HandMeasurement | null = null;

  interrupt() {
    this.samples = []; this.start = null; this.lastSample = null;
  }

  get progress() {
    return this.result ? 1 : this.start === null || this.lastSample === null ? 0
      : Math.min(0.99, this.samples.length / NEUTRAL_MINIMUM_FRAMES, (this.lastSample - this.start) / CALIBRATION_TIMING.neutralMs);
  }

  update(measurement: HandMeasurement | null, tMs: number, size: VideoDimensions, minimumPinch = 0.15) {
    if (!Number.isFinite(tMs) || tMs <= this.lastSource) return this.result;
    this.lastSource = tMs;
    if (this.result) return this.result;
    if (!measurement || measurement.pinchRatio <= minimumPinch) { this.interrupt(); return null; }
    // Scheduling gaps may use the existing tracking grace. Explicit missing or
    // invalid observations still reset immediately; no stale frame earns credit.
    if (this.lastSample !== null && tMs - this.lastSample >= CONTROL_TIMING.freshnessMs) this.interrupt();
    const first = this.samples[0];
    if (first && (Math.hypot((measurement.center.x - first.center.x) * size.width / size.height, measurement.center.y - first.center.y) > 0.025 ||
      Math.abs(measurement.palmScale / first.palmScale - 1) > 0.15 || quaternion(first.rotation).angleTo(quaternion(measurement.rotation)) > Math.PI / 12)) this.interrupt();
    this.start ??= tMs;
    this.lastSample = tMs;
    this.samples.push(measurement);
    if (this.samples.length > 512) this.samples.shift();
    if (this.samples.length >= NEUTRAL_MINIMUM_FRAMES && tMs - this.start >= CALIBRATION_TIMING.neutralMs) {
      this.result = aggregate(this.samples, true);
      this.samples = [];
    }
    return this.result;
  }
}

/** Pure calibration state machine. Only distinct, recent detector frames count. */
export class HandCalibrationController {
  constructor(private readonly surgicalPosture = USE_SURGICAL_POSTURE_MAPPING) {}
  private get prompts() { return this.surgicalPosture ? prompts : legacyPrompts; }
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
  private neutralCaptures = { left: new NeutralPoseCapture(), right: new NeutralPoseCapture() };

  reset(message = "Start the camera, then calibrate controls.") {
    this.profile = null;
    this.state = { stage: "idle", progress: 0, message };
    this.samples = emptySamples(); this.neutral = null; this.closed = null;
    this.workspace = null;
    this.neutralCaptures = { left: new NeutralPoseCapture(), right: new NeutralPoseCapture() };
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
    HAND_SLOTS.forEach(slot => this.neutralCaptures[slot].interrupt());
  }

  retryWorkspace(nowMs: number) {
    if (this.state.stage !== "error" || this.state.retryStage !== "workspace" || !this.workspace) return false;
    this.enter("workspace"); this.lastClock = nowMs; this.lastSource = nowMs;
    HAND_SLOTS.forEach(slot => this.workspace!.interrupt(slot));
    this.workspaceState();
    return true;
  }

  /** Instant 1-hand / 2-hand default profile so users can start with one hand without 8-arrow calibration. */
  applyQuickProfile(size: VideoDimensions) {
    const dimensions = { width: size.width || 1280, height: size.height || 720 };
    this.dimensions = dimensions;
    const defaultHand = (centerX: number): HandCalibration => ({
      neutralCenter: { x: centerX, y: 0.52, z: 0 },
      palmScale: 0.14,
      neutralRotation: { x: 0, y: 0, z: 0, w: 1 },
      openPinchRatio: 0.72,
      closedPinchRatio: 0.18,
      enterPinchRatio: 0.18 + 0.28 * (0.72 - 0.18),
      releasePinchRatio: 0.18 + 0.4 * (0.72 - 0.18),
      range: { left: 0.22, right: 0.22, down: 0.18, up: 0.18 },
    });
    this.profile = {
      dimensions,
      left: defaultHand(0.55),
      right: defaultHand(0.45),
    };
    this.state = {
      stage: "ready",
      progress: 1,
      message: "One hand is enough. Keep that hand in view to control its instrument.",
    };
    this.samples = emptySamples();
  }
  private clearWindow() {
    this.samples = emptySamples(); this.windowStart = null; this.lastSample = null;
    this.state = { ...this.state, progress: 0 };
  }
  private enter(stage: "neutral" | "pinch" | "workspace") {
    this.state = { stage, progress: 0, message: this.prompts[stage] };
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
    if (stage === "neutral" && this.surgicalPosture) { this.captureNeutral(snapshot, nowMs); return; }
    const measured = HAND_SLOTS.map(slot => snapshot[slot] ? measureHand(snapshot[slot]!, this.dimensions, this.surgicalPosture) : null);
    if (nowMs - snapshot.tMs > CONTROL_TIMING.freshnessMs || measured.some(m => !m) ||
      HAND_SLOTS.some(slot => snapshot[slot]!.handednessConfidence < 0.75 || snapshot[slot]!.handedness !== (slot === "left" ? "Left" : "Right"))) {
      this.clearWindow();
      this.state = { ...this.state, message: "Keep both hands fully visible with clear left/right labels. " + this.prompts[stage] };
      return;
    }
    const pair = { left: measured[0]!, right: measured[1]! };
    const poseValid = HAND_SLOTS.every(slot => {
      const m = pair[slot];
      if (stage === "neutral") return m.pinchRatio >= 0.55;
      const open = this.neutral![slot].pinchRatio;
      return m.pinchRatio <= Math.min(0.5, open - 0.15);
    });
    if (!poseValid) { this.clearWindow(); this.state = { ...this.state, message: this.prompts[stage] }; return; }
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
    this.state = { stage, progress: clamp((snapshot.tMs - this.windowStart) / duration, 0, 0.99), message: this.prompts[stage] };
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

  private captureNeutral(snapshot: TrackingSnapshot, nowMs: number) {
    let missing = false, pinched = false;
    for (const slot of HAND_SLOTS) {
      const hand = snapshot[slot];
      const measurement = hand && hand.handedness === (slot === "left" ? "Left" : "Right") && hand.handednessConfidence >= 0.75 &&
        nowMs - snapshot.tMs <= CONTROL_TIMING.freshnessMs ? measureHand(hand, this.dimensions, true) : null;
      missing ||= measurement === null;
      pinched ||= measurement !== null && measurement.pinchRatio <= 0.15;
      this.neutralCaptures[slot].update(measurement, snapshot.tMs, this.dimensions);
    }
    const neutralHands = { left: this.neutralCaptures.left.progress, right: this.neutralCaptures.right.progress };
    const completed = HAND_SLOTS.filter(slot => this.neutralCaptures[slot].result).map(slot => `${slot === "left" ? "Left" : "Right"} hand calibrated. `).join("");
    this.state = { stage: "neutral", progress: (neutralHands.left + neutralHands.right) / 2, neutralHands,
      message: completed + (missing ? "Keep both hands fully visible with clear left/right labels. " : pinched ? "Separate thumb and index slightly without changing your wrist posture. " : "Hold steady. ") + prompts.neutral };
    if (this.neutralCaptures.left.result && this.neutralCaptures.right.result) {
      this.neutral = { left: this.neutralCaptures.left.result, right: this.neutralCaptures.right.result };
      this.enter("pinch");
    }
  }

  private workspaceState(message?: string) {
    const progress = this.workspace!.progress();
    const next = this.workspace!.next();
    const prompt = next ? `Move your ${next.slot} hand ${next.direction} in the mirrored preview, then hold briefly until that arrow is checked.`
      : "Keep both hands visible with thumb and index apart briefly to finish.";
    this.state = { stage: "workspace", progress: Math.min(0.99, Object.values(progress).flatMap(Object.values).reduce((sum, value) => sum + value, 0) / 8),
      message: message ?? prompt, workspace: progress, secondsRemaining: Math.ceil((CALIBRATION_TIMING.workspaceTimeoutMs - this.elapsed) / 1000) };
  }

  private captureWorkspace(snapshot: TrackingSnapshot, nowMs: number) {
    const problems: string[] = [];
    for (const slot of HAND_SLOTS) {
      const hand = snapshot[slot];
      let measurement = hand && hand.handedness === (slot === "left" ? "Left" : "Right") && hand.handednessConfidence >= 0.75 &&
        nowMs - snapshot.tMs <= CONTROL_TIMING.freshnessMs ? measureHand(hand, this.dimensions, this.surgicalPosture) : null;
      if (!measurement) problems.push(this.surgicalPosture ? `Keep your ${slot} hand visible above your desk; angle it slightly toward the camera while keeping a natural operating posture.` : `Keep your ${slot} hand visible, palm facing the camera.`);
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
      this.state = { stage: "ready", progress: 1, message: "Calibration ready. Move, rotate, and pinch to drive the instruments." };
      this.samples = emptySamples();
    }
  }
}
