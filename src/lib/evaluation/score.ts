import type { Quat, Vec3 } from "@/types/geometry";

// Map an error to a 0-100 score given a skill-specific tolerance (plan 13.2).
// 100 at zero error, 0 at/above tolerance, linear in between.
export function errorToScore(error: number, tolerance: number): number {
  if (tolerance <= 0) return error <= 0 ? 100 : 0;
  const normalized = Math.min(1, Math.max(0, error / tolerance));
  return Math.round(100 * (1 - normalized));
}

export function tipDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Angular difference between two orientations in degrees. Handles quaternion
// double cover (q and -q are the same rotation) via the absolute dot product.
export function quatAngleDeg(a: Quat, b: Quat): number {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  const clamped = Math.min(1, Math.max(-1, dot));
  return (2 * Math.acos(clamped) * 180) / Math.PI;
}

export function pathLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += tipDistance(points[i - 1], points[i]);
  }
  return total;
}
