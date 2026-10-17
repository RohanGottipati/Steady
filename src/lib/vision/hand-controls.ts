import { OneEuroFilter, smoothingAlpha, type FilterOptions } from "@/lib/filters/one-euro";
import type { Quat, Vec3 } from "@/types";
import { HandCalibrationController } from "./calibration";
import { CONTROL_TIMING, DEFAULT_MAPPING, HAND_SLOTS, emptyControlSnapshot, type ControlMappingOptions, type ControlSnapshot, type HandControl, type HandSlot, type VideoDimensions } from "./control-types";
import { clamp, finitePoint, measureHand, plainQuat, quaternion, relativeRotation, validDimensions, type HandMeasurement } from "./hand-geometry";
import { PinchHysteresis } from "./pinch";
import type { RawTrackedHand, TrackingSnapshot } from "./types";

/** Control-specific tuning in scene units / radians. The generic 1 Hz default
 * adds ~120 ms of phase lag in the synthetic 0.5 Hz motion test, before camera/inference costs.
 * Keep derivative smoothing and quaternion interpolation; don't remove filtering.
 */
export const CONTROL_FILTER: Readonly<FilterOptions> = { minCutoff: 3, beta: 0.75, derivativeCutoff: 1 };

class HandRuntime {
  control: HandControl = emptyControlSnapshot().left;
  consecutive = 0;
  previousSource: number | null = null;
  position = { x: new OneEuroFilter(CONTROL_FILTER), y: new OneEuroFilter(CONTROL_FILTER), z: new OneEuroFilter(CONTROL_FILTER) };
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
  readonly calibration = new HandCalibrationController();
  snapshot: ControlSnapshot = emptyControlSnapshot();
  private hands = { left: new HandRuntime(), right: new HandRuntime() };
  private lastSource = -Infinity;
  private size: VideoDimensions | null = null;
  private suspended = true;
  private planar = false;
  private singleHand = false;
  private readonly mapping: ControlMappingOptions;

  constructor(mapping: Partial<ControlMappingOptions> = {}) {
    this.mapping = { ...DEFAULT_MAPPING, ...mapping, leftRest: { ...(mapping.leftRest ?? DEFAULT_MAPPING.leftRest) }, rightRest: { ...(mapping.rightRest ?? DEFAULT_MAPPING.rightRest) } };
    if (!finitePoint(this.mapping.leftRest) || !finitePoint(this.mapping.rightRest) ||
      ![this.mapping.xyTravel, this.mapping.maxDepth, this.mapping.maxRotationRad].every(n => Number.isFinite(n) && n > 0) ||
      this.mapping.maxRotationRad > Math.PI) throw new Error("Invalid hand control mapping.");
  }

  reset(message?: string) {
    this.calibration.reset(message);
    this.hands = { left: new HandRuntime(), right: new HandRuntime() };
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
    this.size = { ...validSize };
    this.suspended = false;
    this.singleHand = true;
    this.calibration.applyQuickProfile(validSize);
    this.publish();
  }

  suspend(nowMs: number) {
    this.suspended = true;
    this.calibration.suspend();
    HAND_SLOTS.forEach(slot => this.hands[slot].interrupt(nowMs, true));
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
    this.calibration.tick(nowMs);
    const newSource = Number.isFinite(raw.tMs) && raw.tMs > this.lastSource && raw.tMs <= nowMs;
    if (newSource) {
      this.lastSource = raw.tMs;
      this.calibration.update(raw, nowMs);
      for (const slot of HAND_SLOTS) {
        const hand = raw[slot];
        const measurement = hand && hand.handedness === (slot === "left" ? "Left" : "Right") &&
          nowMs - raw.tMs <= CONTROL_TIMING.freshnessMs ? measureHand(hand, size) : null;
        if (!hand || !measurement || !this.calibration.profile) this.hands[slot].interrupt(nowMs);
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
    const calibrated = this.calibration.profile !== null;
    const readyHands = this.singleHand
      ? [left, right].some(hand => hand.status === "tracking" && !hand.rotationHeld)
      : [left, right].every(hand => hand.status === "tracking" && !hand.rotationHeld);
    this.snapshot = { sourceTMs: Number.isFinite(this.lastSource) ? this.lastSource : null, calibrated,
      canProgress: calibrated && !this.suspended && readyHands, left, right };
  }

  private consume(slot: HandSlot, hand: RawTrackedHand, m: HandMeasurement, tMs: number) {
    const runtime = this.hands[slot];
    const profile = this.calibration.profile![slot];
    if (runtime.previousSource !== null && tMs - runtime.previousSource > CONTROL_TIMING.maxSampleGapMs) runtime.interrupt(tMs);
    runtime.previousSource = tMs;
    const recovering = runtime.control.status !== "tracking";
    if (recovering) runtime.consecutive++;
    if (recovering && runtime.consecutive < CONTROL_TIMING.recoveryFrames) {
      runtime.control = { ...runtime.control, status: "recovering", hand: null, lastSeenMs: tMs };
      return;
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
    const desiredRotation = relativeRotation(m.rotation, profile.neutralRotation, this.mapping.maxRotationRad);
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
  }
}
