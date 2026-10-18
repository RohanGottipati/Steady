import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Quat, Vec3 } from "@/types";
import type { RawTrackedHand } from "./types";
import { USE_SURGICAL_POSTURE_MAPPING, type HandSlot, type VideoDimensions } from "./control-types";

/** Hand and instrument local axes: +X across/jaw opening, +Y forward/shaft,
 * +Z normal. No model rotation is necessary; keep canonical references intact. */
export const HAND_TO_TOOL_AXIS_CORRECTION: Readonly<Quat> = { x: 0, y: 0, z: 0, w: 1 };
export const TOOL_NEUTRAL_ROTATIONS: Readonly<Record<HandSlot, Readonly<Quat>>> = {
  left: { x: 0, y: 0, z: 0, w: 1 }, right: { x: 0, y: 0, z: 0, w: 1 },
};
export const SURGICAL_ROTATION_LIMITS = { pitch: 50 * Math.PI / 180, roll: 80 * Math.PI / 180, yaw: 60 * Math.PI / 180 } as const;
// Lateral wrist sweep must follow the user's mirrored workspace view. This is
// a control direction, not another landmark reflection or model-axis offset.
export const SURGICAL_YAW_DIRECTION = -1;

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const finitePoint = (p: Vec3) => !!p && [p.x, p.y, p.z].every(Number.isFinite);
export const plainQuat = (q: Quaternion): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
export const quaternion = (q: Quat) => new Quaternion(q.x, q.y, q.z, q.w);
export function validDimensions(size: VideoDimensions) {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}
/** Reflection is applied to points, then a RIGHT-handed basis is reconstructed.
 * A reflection matrix itself is never converted into a quaternion.
 */
function canonicalPoint(p: Vec3) { return new Vector3(-p.x, -p.y, -p.z); }

export interface HandMeasurement { center: Vec3; palmScale: number; pinchRatio: number; rotation: Quat }
export function measureHand(hand: RawTrackedHand, size: VideoDimensions, surgicalPosture = USE_SURGICAL_POSTURE_MAPPING): HandMeasurement | null {
  if (!validDimensions(size) || !finitePoint(hand.palmCenter) ||
    ![hand.landmarks, hand.worldLandmarks].every(points => points.length === 21 && points.every(finitePoint)) ||
    !Number.isFinite(hand.handednessConfidence) || hand.handednessConfidence < 0 || hand.handednessConfidence > 1) return null;
  const world = hand.worldLandmarks;
  const index = canonicalPoint(world[5]);
  const pinky = canonicalPoint(world[17]);
  const wrist = canonicalPoint(world[0]);
  const middle = canonicalPoint(world[9]);
  const horizontal = index.sub(pinky);
  const width = horizontal.length();
  const vertical = middle.sub(wrist);
  if (!Number.isFinite(width) || !Number.isFinite(vertical.length()) || width < 1e-4 || vertical.length() < 1e-4) return null;
  if (surgicalPosture) {
    // Anatomical index-to-pinky directions oppose each other. Correct across
    // before reconstructing the normal: this is a proper rotation, not a mirror.
    if (hand.handedness === "Left") horizontal.negate();
    vertical.normalize();
    horizontal.addScaledVector(vertical, -horizontal.dot(vertical));
    if (!Number.isFinite(horizontal.length()) || horizontal.length() < 1e-4) return null;
    horizontal.normalize();
  } else {
    horizontal.normalize();
    vertical.addScaledVector(horizontal, -vertical.dot(horizontal));
    if (!Number.isFinite(vertical.length()) || vertical.length() < 1e-4) return null;
    vertical.normalize();
  }
  const normal = new Vector3().crossVectors(horizontal, vertical).normalize();
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(horizontal, vertical, normal)).normalize();
  const a = hand.landmarks[5], b = hand.landmarks[17];
  const palmScale = Math.hypot((a.x - b.x) * size.width / size.height, a.y - b.y);
  const pinchRatio = new Vector3().subVectors(world[4], world[8]).length() / width;
  if (!Number.isFinite(palmScale) || palmScale < 0.01 || !Number.isFinite(pinchRatio) || pinchRatio > 5 ||
    ![rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) return null;
  return { center: { ...hand.palmCenter }, palmScale, pinchRatio, rotation: plainQuat(rotation) };
}

export function relativeRotation(current: Quat, neutral: Quat, limit: number): Quat {
  const q = quaternion(current).multiply(quaternion(neutral).invert()).normalize();
  return limitRotation(q, limit);
}

function limitRotation(q: Quaternion, limit: number): Quat {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const angle = new Quaternion().angleTo(q);
  if (angle > limit) q.slerpQuaternions(new Quaternion(), q.clone(), limit / angle);
  return plainQuat(q);
}

/** Local displacement: current = neutral * relative, hence relative = neutral^-1 * current. */
export function handRelativeRotation(current: Quat, neutral: Quat): Quaternion {
  return quaternion(neutral).invert().multiply(quaternion(current)).normalize();
}

export function surgicalToolRotation(current: Quat, neutral: Quat, limit: number, slot: HandSlot): Quat {
  const correction = quaternion(HAND_TO_TOOL_AXIS_CORRECTION);
  const relative = correction.clone().multiply(handRelativeRotation(current, neutral)).multiply(correction.clone().invert()).normalize();
  // Euler is confined to limits/directional mapping. Y is shaft roll; Z is workspace yaw.
  const angles = new Euler().setFromQuaternion(relative, "YXZ");
  angles.x = clamp(angles.x, -SURGICAL_ROTATION_LIMITS.pitch, SURGICAL_ROTATION_LIMITS.pitch);
  angles.y = clamp(angles.y, -SURGICAL_ROTATION_LIMITS.roll, SURGICAL_ROTATION_LIMITS.roll);
  angles.z = SURGICAL_YAW_DIRECTION * clamp(angles.z, -SURGICAL_ROTATION_LIMITS.yaw, SURGICAL_ROTATION_LIMITS.yaw);
  const constrained = limitRotation(new Quaternion().setFromEuler(angles), limit);
  return plainQuat(quaternion(TOOL_NEUTRAL_ROTATIONS[slot]).multiply(quaternion(constrained)).normalize());
}
