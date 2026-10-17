import { Quaternion, Vector3 } from "three";
import type { Quat, ToolId, ToolState, Vec3 } from "@/types";
import { CONTROL_TIMING, HAND_SLOTS, type ControlSnapshot, type ToolControlTarget } from "@/lib/vision/control-types";

export const TIP_OFFSET: Readonly<Vec3> = { x: 0, y: 0.35, z: 0 };
export const GRAB_RADIUS = 0.10;
export const ASSISTED_GRAB_RADIUS = 0.16;
export const NEEDLE_ID = "practice-needle";
export interface Pose { position: Vec3; rotation: Quat }
export interface TaskObject extends Pose { id: string; heldBy: ToolId | null }
export interface SimulationEvent { kind: "grab" | "release"; sourceTMs: number; toolId: ToolId; objectId: string }
export interface SimulationSnapshot {
  assisted: boolean;
  sourceTMs: number | null;
  canProgress: boolean;
  reason: string;
  left: ToolState | null;
  right: ToolState | null;
  object: TaskObject;
}
const identity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const quat = (q: Quat) => new Quaternion(q.x, q.y, q.z, q.w);
const point = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const rotation = (q: Quaternion): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const finitePoint = (p: Vec3 | null | undefined) => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const initial = (assisted: boolean): SimulationSnapshot => ({ assisted, sourceTMs: null, canProgress: false, reason: "Calibrate both hands to begin.", left: null, right: null,
  object: { id: NEEDLE_ID, position: { x: 0, y: 0.35, z: 0 }, rotation: identity(), heldBy: null } });

/** Reject invalid/overflowing geometry before publishing any part of a sample. */
export function toolFromTarget(target: ToolControlTarget | null, id: ToolId, assisted = false): ToolState | null {
  if (!target || target.id !== id || typeof target.jawClosed !== "boolean" || !finitePoint(target.position) || !target.rotation) return null;
  if (![target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w].every(Number.isFinite)) return null;
  const q = quat(target.rotation), length = q.length();
  if (!Number.isFinite(length) || length < 1e-8) return null;
  q.normalize();
  const offset = vector(TIP_OFFSET).applyQuaternion(q);
  const position = { ...target.position };
  // Keep actual jaw contacts on the working plane, rather than faking a 2D hit.
  if (assisted) position.z = -offset.z;
  const tipPosition = point(offset.add(vector(position)));
  if (!finitePoint(tipPosition)) return null;
  return { id, position, rotation: rotation(q), tipPosition, jawClosed: target.jawClosed };
}

export function pickupFeedback(snapshot: SimulationSnapshot) {
  const radius = snapshot.assisted ? ASSISTED_GRAB_RADIUS : GRAB_RADIUS;
  const tools = HAND_SLOTS.map(slot => {
    const tool = snapshot[slot];
    const distance = tool ? vector(tool.tipPosition).distanceTo(vector(snapshot.object.position)) : Infinity;
    return { slot, tool, distance, inRange: snapshot.canProgress && !snapshot.object.heldBy && distance <= radius };
  });
  if (!snapshot.canProgress) return { radius, tools, ready: false, message: snapshot.reason };
  if (snapshot.object.heldBy) return { radius, tools, ready: false, message: `Needle held by ${snapshot.object.heldBy === "left-tool" ? "left" : "right"} instrument. Open your thumb and index finger to release.` };
  const byDistance = [...tools].sort((a, b) => a.distance - b.distance);
  const nearest = byDistance.find(candidate => candidate.inRange && candidate.tool?.jawClosed === false) ?? byDistance[0];
  if (!nearest?.tool) return { radius, tools, ready: false, message: "Waiting for usable instrument poses." };
  const tool = nearest.tool;
  const ready = nearest.inRange && !tool.jawClosed;
  const depthMismatch = !snapshot.assisted && Math.hypot(tool.tipPosition.x - snapshot.object.position.x, tool.tipPosition.y - snapshot.object.position.y) <= radius && Math.abs(tool.tipPosition.z - snapshot.object.position.z) > radius;
  const message = nearest.inRange ? ready
    ? `${nearest.slot === "left" ? "Left" : "Right"} tip aligned — pinch thumb and index finger to pick up.`
    : "Open your thumb and index finger first, then pinch again to pick up."
    : depthMismatch ? `Depth is off: move your hand ${tool.tipPosition.z > snapshot.object.position.z ? "farther from" : "closer to"} the camera, or enable Easy pickup.`
    : "Open your hand and move a colored tip ring inside the needle’s pickup circle.";
  return { radius, tools, ready, message };
}

export function relativePose(parent: Pose, child: Pose): Pose {
  const inverse = quat(parent.rotation).invert();
  return { position: point(vector(child.position).sub(vector(parent.position)).applyQuaternion(inverse)),
    rotation: rotation(inverse.multiply(quat(child.rotation)).normalize()) };
}
export function composePose(parent: Pose, local: Pose): Pose {
  return { position: point(vector(local.position).applyQuaternion(quat(parent.rotation)).add(vector(parent.position))),
    rotation: rotation(quat(parent.rotation).multiply(quat(local.rotation)).normalize()) };
}

/** Pure numerical state machine. Source milliseconds are never render timestamps.
 * Consumers must treat snapshots as read-only. No input objects are mutated.
 */
export class ToolSimulationController {
  snapshot: SimulationSnapshot;
  private assisted: boolean;
  epoch = 0;
  attachment: Pose | null = null;
  private lastSource = -Infinity;
  private armed = { left: false, right: false };

  constructor({ assisted = true }: { assisted?: boolean } = {}) { this.assisted = assisted; this.snapshot = initial(assisted); }

  setAssisted(enabled: boolean) { if (enabled !== this.assisted) { this.assisted = enabled; this.reset(); } }

  reset() { this.epoch++; this.snapshot = initial(this.assisted); this.attachment = null; this.armed = { left: false, right: false }; }

  suspend(reason = "Simulation paused until both controls are tracking.") {
    this.armed = { left: false, right: false };
    this.snapshot = { ...this.snapshot, canProgress: false, reason };
  }

  update(controls: ControlSnapshot, nowMs: number): SimulationEvent[] {
    if (!controls.calibrated) { this.reset(); return []; }
    const source = controls.sourceTMs;
    const validTime = Number.isFinite(nowMs) && source !== null && Number.isFinite(source) && source <= nowMs && nowMs - source < CONTROL_TIMING.freshnessMs;
    if (!validTime) { this.suspend("Simulation paused: waiting for fresh controls."); return []; }
    if (source! < this.lastSource) { this.suspend("Simulation paused: reordered controls."); return []; }
    const eligible = controls.canProgress && HAND_SLOTS.every(slot => {
      const hand = controls[slot];
      return hand.status === "tracking" && hand.hand?.handedness === (slot === "left" ? "Left" : "Right") && !hand.rotationHeld && hand.lastSeenMs === source;
    });
    if (!eligible) { this.lastSource = Math.max(this.lastSource, source!); this.suspend(); return []; }
    const left = toolFromTarget(controls.left.target, "left-tool", this.assisted), right = toolFromTarget(controls.right.target, "right-tool", this.assisted);
    if (!left || !right) {
      this.lastSource = Math.max(this.lastSource, source!);
      this.suspend("Simulation paused: invalid instrument geometry."); return [];
    }
    // Suspension is honored even for repeated sources; resuming requires a new one.
    if (source === this.lastSource) return [];
    if (source! - this.lastSource > CONTROL_TIMING.maxSampleGapMs) this.armed = { left: false, right: false };
    this.lastSource = source!;
    let object: TaskObject = { ...this.snapshot.object, position: { ...this.snapshot.object.position }, rotation: { ...this.snapshot.object.rotation } };
    const events: SimulationEvent[] = [];
    const tools = { left, right };
    const wasHeld = object.heldBy !== null;
    if (object.heldBy && this.attachment) {
      const owner = object.heldBy === "left-tool" ? left : right;
      object = { ...object, ...composePose(owner, this.attachment) };
      if (!owner.jawClosed) {
        events.push({ kind: "release", sourceTMs: source!, toolId: owner.id, objectId: object.id });
        object.heldBy = null; this.attachment = null;
      }
    }
    // Only objects free at the start of the sample can be acquired: no atomic handoff.
    if (!wasHeld) {
      const candidates = HAND_SLOTS.filter(slot => tools[slot].jawClosed && this.armed[slot])
        .map(slot => ({ tool: tools[slot], distance: vector(tools[slot].tipPosition).distanceTo(vector(object.position)) }))
        .filter(candidate => candidate.distance <= (this.assisted ? ASSISTED_GRAB_RADIUS : GRAB_RADIUS))
        .sort((a, b) => a.distance - b.distance || (a.tool.id < b.tool.id ? -1 : a.tool.id > b.tool.id ? 1 : 0));
      if (candidates.length) {
        const owner = candidates[0].tool;
        if (this.assisted) object.position = { ...owner.tipPosition };
        this.attachment = relativePose(owner, object); object.heldBy = owner.id;
        events.push({ kind: "grab", sourceTMs: source!, toolId: owner.id, objectId: object.id });
      }
    }
    for (const slot of HAND_SLOTS) {
      this.armed[slot] = !tools[slot].jawClosed;
      if (object.heldBy === tools[slot].id) tools[slot].heldObjectId = object.id;
    }
    this.snapshot = { assisted: this.assisted, sourceTMs: source!, canProgress: true, reason: "Simulation ready", left, right, object };
    return events;
  }
}

/** Display-only interpolation. Never feed these poses back into interaction/evaluation. */
export function interpolatePose(current: Pose, target: Pose, deltaSeconds: number): Pose {
  const dt = Number.isFinite(deltaSeconds) ? Math.min(0.05, Math.max(0, deltaSeconds)) : 0;
  const alpha = 1 - Math.exp(-40 * dt);
  return { position: point(vector(current.position).lerp(vector(target.position), alpha)),
    rotation: rotation(quat(current.rotation).slerp(quat(target.rotation), alpha).normalize()) };
}
