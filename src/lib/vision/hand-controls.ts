import { Euler, Vector3 } from "three";
import { OneEuroFilter, smoothingAlpha, type FilterOptions } from "@/lib/filters/one-euro";
import type { Quat, Vec3 } from "@/types";
import { HandCalibrationController, NeutralPoseCapture } from "./calibration";
import { CONTROL_TIMING, DEFAULT_MAPPING, HAND_SLOTS, USE_SURGICAL_POSTURE_MAPPING, emptyControlSnapshot, type ControlMappingOptions, type ControlSnapshot, type HandControl, type HandSlot, type VideoDimensions } from "./control-types";
import { clamp, finitePoint, handRelativeRotation, measureHand, plainQuat, quaternion, relativeRotation, surgicalToolRotation, validDimensions, type HandMeasurement } from "./hand-geometry";
import { PinchHysteresis } from "./pinch";
import type { RawTrackedHand, TrackingSnapshot } from "./types";

/** Control-specific tuning in scene units / radians. The generic 1 Hz default
 * adds ~120 ms of phase lag in the synthetic 0.5 Hz motion test, before camera/inference costs.
 * Keep derivative smoothing and quaternion interpolation; don't remove filtering.
 */
export const CONTROL_FILTER: Readonly<FilterOptions> = { minCutoff: 3, beta: 0.75, derivativeCutoff: 1 };
export const DEPTH_FILTER: Readonly<FilterOptions> = { minCutoff: 1.5, beta: 0.25, derivativeCutoff: 1 };

export interface HandOrientationDiagnostics {
  handedness: RawTrackedHand["handedness"] | null;
  confidence: number | null;
  calibrated: boolean;
  palmNormal: Vec3 | null;
  /** Radians: X pitch, Y shaft roll, Z workspace yaw, in YXZ order. */
  relativeAngles: Vec3 | null;
}
const emptyDiagnostics = (): HandOrientationDiagnostics => ({ handedness: null, confidence: null, calibrated: false, palmNormal: null, relativeAngles: null });

class HandRuntime {
  control: HandControl = emptyControlSnapshot().left;
  consecutive = 0;
  previousSource: number | null = null;
  position: Record<"x" | "y" | "z", OneEuroFilter>;
  constructor(surgicalPosture: boolean) {
    this.position = { x: new OneEuroFilter(CONTROL_FILTER), y: new OneEuroFilter(CONTROL_FILTER), z: new OneEuroFilter(surgicalPosture ? DEPTH_FILTER : CONTROL_FILTER) };
  }
  angularSpeed = new OneEuroFilter({ beta: 0 });
  pinch = new PinchHysteresis();
  measuredRotation: { rotation: Quat; tMs: number } | null = null;
  rejectedRotation: { rotation: Quat; count: number } | null = null;
  rotationTime: number | null = null;

  interrupt(nowMs: number, suspended = false) {
    this.consecutive = 0; this.previousSource = null;
    this.pinch.interrupt(); this.rejectedRotation = null;
    const last = this.control.lastSeenMs;
    this.control = { ...this.control, hand: null, status: this.control.target
      ? suspended || last === null || nowMs - last >= CONTROL_TIMING.freshnessMs ? "lost" : "grace"
      : "unavailable" };
  }

  seed(tMs: number, position: Vec3) {
    for (const axis of ["x", "y", "z"] as const) this.position[axis].reset(position[axis], tMs);
    this.angularSpeed.reset(0, tMs); this.rotationTime = tMs;
    this.measuredRotation = null; this.rejectedRotation = null;
  }
}

/** Owns all temporal state. update() is safe to call at display FPS; it consumes
 * each raw timestamp once, but expires observations even when the camera stalls.
 */
export class HandControlsController {
  readonly calibration: HandCalibrationController;
  snapshot: ControlSnapshot = emptyControlSnapshot();
  diagnostics = { left: emptyDiagnostics(), right: emptyDiagnostics() };
  private hands: Record<HandSlot, HandRuntime>;
  private lastSource = -Infinity;
  private size: VideoDimensions | null = null;
  private suspended = true;
  private planar = false;
  private singleHand = false;
  private quickNeutralPending = { left: false, right: false };
  private quickCaptures = { left: new NeutralPoseCapture(), right: new NeutralPoseCapture() };
  private quickActive = false;
  private readonly mapping: ControlMappingOptions;

  constructor(mapping: Partial<ControlMappingOptions> = {}, private readonly surgicalPosture = USE_SURGICAL_POSTURE_MAPPING) {
    this.calibration = new HandCalibrationController(surgicalPosture);
    this.hands = { left: new HandRuntime(surgicalPosture), right: new HandRuntime(surgicalPosture) };
    this.mapping = { ...DEFAULT_MAPPING, ...mapping, leftRest: { ...(mapping.leftRest ?? DEFAULT_MAPPING.leftRest) }, rightRest: { ...(mapping.rightRest ?? DEFAULT_MAPPING.rightRest) } };
    if (!finitePoint(this.mapping.leftRest) || !finitePoint(this.mapping.rightRest) ||
      ![this.mapping.xyTravel, this.mapping.maxDepth, this.mapping.maxRotationRad].every(n => Number.isFinite(n) && n > 0) ||
      this.mapping.maxRotationRad > Math.PI) throw new Error("Invalid hand control mapping.");
  }

  reset(message?: string) {
    this.calibration.reset(message);
    this.quickNeutralPending = { left: false, right: false };
    this.quickCaptures = { left: new NeutralPoseCapture(), right: new NeutralPoseCapture() };
    this.quickActive = false;
    this.diagnostics = { left: emptyDiagnostics(), right: emptyDiagnostics() };
    this.hands = { left: new HandRuntime(this.surgicalPosture), right: new HandRuntime(this.surgicalPosture) };
    this.snapshot = emptyControlSnapshot(); this.lastSource = -Infinity; this.size = null; this.suspended = true;
  }

  beginCalibration(nowMs: number, size: VideoDimensions) {
    if (!Number.isFinite(nowMs) || !validDimensions(size)) return;
    if (this.size?.width === size.width && this.size.height === size.height && this.calibration.retryWorkspace(nowMs)) return;
    this.reset(); this.size = { ...size };
    this.calibration.start(nowMs, size);
  }

  setPlanar(enabled: boolean) { this.planar = enabled; }

  setSingleHand(enabled: boolean) {
    this.singleHand = enabled;
    this.publish();
  }

  quickCalibrate(size: VideoDimensions) {
    const validSize = validDimensions(size) ? size : { width: 1280, height: 720 };
    this.reset();
    this.size = { ...validSize };
    this.suspended = false;
    this.singleHand = true;
    this.quickActive = true;
    this.quickNeutralPending = { left: true, right: true };
    this.calibration.applyQuickProfile(validSize);
    this.publish();
  }

  suspend(nowMs: number) {
    this.suspended = true;
    this.calibration.suspend();
    HAND_SLOTS.forEach(slot => this.hands[slot].interrupt(nowMs, true));
    HAND_SLOTS.forEach(slot => this.quickCaptures[slot].interrupt());
    this.publish();
  }

  update(raw: TrackingSnapshot, nowMs: number, size: VideoDimensions) {
    if (!Number.isFinite(nowMs)) return;
    if (!validDimensions(size)) { this.suspend(nowMs); return; }
    if (this.size && (this.size.width !== size.width || this.size.height !== size.height)) {
      this.reset("Camera format changed. Recalibrate controls.");
    }
    this.size = { ...size };
    if (this.suspended) { this.suspended = false; this.calibration.suspend(); }
    if (!this.quickActive) this.calibration.tick(nowMs);
    const newSource = Number.isFinite(raw.tMs) && raw.tMs > this.lastSource && raw.tMs <= nowMs;
    if (newSource) {
      this.lastSource = raw.tMs;
      if (!this.quickActive) this.calibration.update(raw, nowMs);
      for (const slot of HAND_SLOTS) {
        const hand = raw[slot];
        const measurement = hand && hand.handedness === (slot === "left" ? "Left" : "Right") &&
          nowMs - raw.tMs <= CONTROL_TIMING.freshnessMs ? measureHand(hand, size, this.surgicalPosture) : null;
        if (hand && measurement && !this.calibration.profile) this.updateDiagnostics(slot, hand, measurement, false);
        if (!hand || !measurement || !this.calibration.profile) {
          this.hands[slot].interrupt(nowMs);
          this.quickCaptures[slot].interrupt();
        }
        else this.consume(slot, hand, measurement, raw.tMs);
      }
    }
    for (const slot of HAND_SLOTS) {
      const runtime = this.hands[slot];
      if (runtime.control.lastSeenMs !== null && nowMs - runtime.control.lastSeenMs >= CONTROL_TIMING.freshnessMs) runtime.interrupt(nowMs);
    }
    this.publish();
  }

  private publish() {
    const left = this.hands.left.control, right = this.hands.right.control;
    const quickCapturing = this.surgicalPosture && this.quickActive;
    const anyQuickReady = !this.quickNeutralPending.left || !this.quickNeutralPending.right;
    const calibrated = this.calibration.profile !== null && (!quickCapturing || anyQuickReady);
    if (quickCapturing) {
      const neutralHands = { left: this.quickCaptures.left.progress, right: this.quickCaptures.right.progress };
      const complete = HAND_SLOTS.filter(slot => !this.quickNeutralPending[slot]).map(slot => `${slot === "left" ? "Left" : "Right"} hand calibrated.`).join(" ");
      this.calibration.state = { stage: anyQuickReady ? "ready" : "neutral", progress: Math.max(neutralHands.left, neutralHands.right), neutralHands,
        message: anyQuickReady ? `${complete} Move, rotate, and pinch to drive the instruments.${this.quickNeutralPending.left || this.quickNeutralPending.right ? " Hold the other hand still to set it up." : ""}`
          : "Hold either hand naturally above your desk, palm mostly downward and slightly inward. Keep thumb and index slightly apart and hold steady while we capture your neutral pose." };
    }
    const readyHands = this.singleHand
      ? [left, right].some(hand => hand.status === "tracking" && !hand.rotationHeld)
      : [left, right].every(hand => hand.status === "tracking" && !hand.rotationHeld);
    this.snapshot = { sourceTMs: Number.isFinite(this.lastSource) ? this.lastSource : null, calibrated,
      canProgress: calibrated && !this.suspended && readyHands, left, right };
  }

  private consume(slot: HandSlot, hand: RawTrackedHand, m: HandMeasurement, tMs: number) {
    const runtime = this.hands[slot];
    const profile = this.calibration.profile![slot];
    // Inference cadence can vary while the 3D scene is rendering. A sample still
    // within tracking freshness must not restart the recovery sequence each time.
    if (runtime.previousSource !== null && tMs - runtime.previousSource >= CONTROL_TIMING.freshnessMs) runtime.interrupt(tMs);
    runtime.previousSource = tMs;
    const recovering = runtime.control.status !== "tracking";
    const briefGap = runtime.control.status === "grace" && runtime.control.target !== null &&
      runtime.control.lastSeenMs !== null && tMs - runtime.control.lastSeenMs < CONTROL_TIMING.freshnessMs;
    if (this.quickNeutralPending[slot] && this.surgicalPosture) {
      const capture = this.quickCaptures[slot];
      const neutral = capture.update(hand.handednessConfidence >= 0.75 ? m : null, tMs, this.size!, profile.releasePinchRatio);
      if (!neutral) {
        runtime.control = { ...runtime.control, status: "recovering", hand: null, lastSeenMs: tMs };
        this.updateDiagnostics(slot, hand, m, false);
        return;
      }
      profile.neutralCenter = { ...neutral.center };
      profile.neutralRotation = { ...neutral.rotation };
      profile.palmScale = neutral.palmScale;
      this.quickNeutralPending[slot] = false;
    }
    // Calibration observes fresh geometry independently of tool recovery. Tools
    // still require three consecutive usable frames before publishing a target.
    if (briefGap) runtime.consecutive = CONTROL_TIMING.recoveryFrames;
    else if (recovering) runtime.consecutive++;
    if (recovering && runtime.consecutive < CONTROL_TIMING.recoveryFrames) {
      runtime.control = { ...runtime.control, status: "recovering", hand: null, lastSeenMs: tMs };
      return;
    }
    // Legacy emergency fallback keeps the previous single-frame quick neutral.
    if (this.quickNeutralPending[slot] && !this.surgicalPosture && hand.handednessConfidence >= 0.5 && m.pinchRatio >= profile.releasePinchRatio) {
      profile.neutralRotation = { ...m.rotation };
      profile.palmScale = m.palmScale;
      this.quickNeutralPending[slot] = false;
    }
    const rest = this.singleHand
      ? { x: 0, y: 0, z: 0 }
      : slot === "left"
        ? this.mapping.leftRest
        : this.mapping.rightRest;
    const dx = (profile.neutralCenter.x - m.center.x) * this.size!.width / this.size!.height;
    const dy = profile.neutralCenter.y - m.center.y;
    const position = {
      x: rest.x + clamp(dx / (dx < 0 ? profile.range.left : profile.range.right), -1, 1) * this.mapping.xyTravel,
      y: rest.y + clamp(dy / (dy < 0 ? profile.range.down : profile.range.up), -1, 1) * this.mapping.xyTravel,
      z: rest.z + (this.planar ? 0 : clamp((m.palmScale / profile.palmScale - 1) * 2, -1, 1) * this.mapping.maxDepth),
    };
    if (recovering) runtime.seed(tMs, runtime.control.target?.position ?? position);
    const filtered = { ...position };
    for (const axis of ["x", "y", "z"] as const) filtered[axis] = runtime.position[axis].filter(position[axis], tMs)!;
    if (this.planar) { filtered.z = rest.z; runtime.position.z.reset(rest.z, tMs); }
    const desiredRotation = this.surgicalPosture
      ? surgicalToolRotation(m.rotation, profile.neutralRotation, this.mapping.maxRotationRad, slot)
      : relativeRotation(m.rotation, profile.neutralRotation, this.mapping.maxRotationRad);
    let rotation = runtime.control.target?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
    let rotationHeld = hand.handednessConfidence < 0.5;
    const previous = runtime.measuredRotation;
    const jump = previous && tMs - previous.tMs <= CONTROL_TIMING.maxSampleGapMs && quaternion(previous.rotation).angleTo(quaternion(m.rotation)) > Math.PI / 3;
    if (jump) {
      const candidate = runtime.rejectedRotation;
      runtime.rejectedRotation = candidate && quaternion(candidate.rotation).angleTo(quaternion(m.rotation)) < Math.PI / 12
        ? { rotation: m.rotation, count: candidate.count + 1 } : { rotation: m.rotation, count: 1 };
      rotationHeld ||= runtime.rejectedRotation.count < CONTROL_TIMING.recoveryFrames;
    } else runtime.rejectedRotation = null;
    if (!rotationHeld) {
      const delta = Math.max(0, (tMs - (runtime.rotationTime ?? tMs)) / 1000);
      const speed = previous && tMs > previous.tMs ? quaternion(previous.rotation).angleTo(quaternion(m.rotation)) / ((tMs - previous.tMs) / 1000) : 0;
      const filteredSpeed = runtime.angularSpeed.filter(speed, tMs) ?? 0;
      const alpha = delta ? smoothingAlpha(CONTROL_FILTER.minCutoff + CONTROL_FILTER.beta * filteredSpeed, delta) : 0;
      rotation = plainQuat(quaternion(rotation).slerp(quaternion(desiredRotation), alpha).normalize());
      runtime.measuredRotation = { rotation: m.rotation, tMs };
    }
    // Rejected samples cannot accumulate an enormous interpolation timestep.
    runtime.rotationTime = tMs;
    const jawClosed = runtime.pinch.update(m.pinchRatio, tMs, profile.enterPinchRatio, profile.releasePinchRatio);
    runtime.control = {
      status: "tracking", lastSeenMs: tMs, rotationHeld,
      hand: { handedness: hand.handedness, confidence: hand.handednessConfidence,
        landmarks: hand.landmarks, worldLandmarks: hand.worldLandmarks, palmCenter: { ...hand.palmCenter },
        palmRotation: { ...rotation }, pinchRatio: m.pinchRatio, isPinching: jawClosed },
      target: { id: slot === "left" ? "left-tool" : "right-tool", position: filtered, rotation, jawClosed },
    };
    this.updateDiagnostics(slot, hand, m, true);
  }

  private updateDiagnostics(slot: HandSlot, hand: RawTrackedHand, measurement: HandMeasurement, calibrated: boolean) {
    if (process.env.NODE_ENV === "production") return;
    const normal = new Vector3(0, 0, 1).applyQuaternion(quaternion(measurement.rotation));
    const relative = calibrated ? this.surgicalPosture
      ? handRelativeRotation(measurement.rotation, this.calibration.profile![slot].neutralRotation)
      : quaternion(relativeRotation(measurement.rotation, this.calibration.profile![slot].neutralRotation, this.mapping.maxRotationRad)) : null;
    const angles = relative ? new Euler().setFromQuaternion(relative, "YXZ") : null;
    this.diagnostics[slot] = { handedness: hand.handedness, confidence: hand.handednessConfidence, calibrated,
      palmNormal: { x: normal.x, y: normal.y, z: normal.z }, relativeAngles: angles ? { x: angles.x, y: angles.y, z: angles.z } : null };
  }
}
