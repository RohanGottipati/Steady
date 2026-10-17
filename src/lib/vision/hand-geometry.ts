import { Matrix4, Quaternion, Vector3 } from "three";
import type { Quat, Vec3 } from "@/types";
import type { RawTrackedHand } from "./types";
import type { VideoDimensions } from "./control-types";

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
export function measureHand(hand: RawTrackedHand, size: VideoDimensions): HandMeasurement | null {
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
  horizontal.normalize();
  vertical.addScaledVector(horizontal, -vertical.dot(horizontal));
  if (!Number.isFinite(vertical.length()) || vertical.length() < 1e-4) return null;
  vertical.normalize();
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
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const angle = new Quaternion().angleTo(q);
  if (angle > limit) q.slerpQuaternions(new Quaternion(), q.clone(), limit / angle);
  return plainQuat(q);
}
