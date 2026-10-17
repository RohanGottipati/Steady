import type { Quat, Vec3 } from "@/types/geometry";
import type { MotionFrame } from "@/types/motion";
import type { ToolState } from "@/types/tool";

export type ToolPair = { left: ToolState; right: ToolState };

export type AlignedSample = {
  segmentId: string;
  u: number; // normalized position within the segment [0,1]
  refTMs: number;
  userTMs: number;
  ref: ToolPair;
  user: ToolPair;
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpVec = (a: Vec3, b: Vec3, u: number): Vec3 => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
  z: lerp(a.z, b.z, u),
});

function slerp(a: Quat, b: Quat, u: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    const q = { x: lerp(a.x, bx, u), y: lerp(a.y, by, u), z: lerp(a.z, bz, u), w: lerp(a.w, bw, u) };
    const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
  }
  const th0 = Math.acos(dot);
  const th = th0 * u;
  const s0 = Math.cos(th) - (dot * Math.sin(th)) / Math.sin(th0);
  const s1 = Math.sin(th) / Math.sin(th0);
  return {
    x: s0 * a.x + s1 * bx,
    y: s0 * a.y + s1 * by,
    z: s0 * a.z + s1 * bz,
    w: s0 * a.w + s1 * bw,
  };
}

function interpTool(a: ToolState, b: ToolState, u: number): ToolState {
  return {
    id: a.id,
    position: lerpVec(a.position, b.position, u),
    rotation: slerp(a.rotation, b.rotation, u),
    tipPosition: lerpVec(a.tipPosition, b.tipPosition, u),
    jawClosed: (u < 0.5 ? a : b).jawClosed,
  };
}

// Sample a motion's frames for one segment at normalized position u, indexing by
// frame order within that segment (handles differing frame counts/timing).
function sampleSegment(
  frames: readonly MotionFrame[],
  segmentId: string,
  u: number,
): { tMs: number; left: ToolState; right: ToolState } | null {
  const seg = frames.filter((f) => f.segmentId === segmentId);
  if (seg.length === 0) return null;
  if (seg.length === 1) {
    return { tMs: seg[0].tMs, left: seg[0].leftTool, right: seg[0].rightTool };
  }
  const pos = u * (seg.length - 1);
  const i = Math.min(Math.floor(pos), seg.length - 2);
  const f = pos - i;
  return {
    tMs: lerp(seg[i].tMs, seg[i + 1].tMs, f),
    left: interpTool(seg[i].leftTool, seg[i + 1].leftTool, f),
    right: interpTool(seg[i].rightTool, seg[i + 1].rightTool, f),
  };
}

// Align a user attempt to the reference on a shared per-segment normalized grid
// (no DTW — deferred per plan 12.4). Segments come from the reference order.
export function alignBySegment(
  reference: { frames: readonly MotionFrame[] },
  user: { frames: readonly MotionFrame[] },
  samplesPerSegment = 16,
): AlignedSample[] {
  const segmentIds = [...new Set(reference.frames.map((f) => f.segmentId))];
  const k = Math.max(2, samplesPerSegment);
  const out: AlignedSample[] = [];
  for (const segmentId of segmentIds) {
    const hasUserSeg = user.frames.some((f) => f.segmentId === segmentId);
    for (let s = 0; s < k; s++) {
      const u = s / (k - 1);
      const r = sampleSegment(reference.frames, segmentId, u);
      if (!r) continue;
      // If the user never entered this segment, fall back to the reference pose
      // so position/orientation metrics are not double-penalized (sequencing
      // handles the missing/!reordered segment).
      const us = hasUserSeg ? sampleSegment(user.frames, segmentId, u) : null;
      out.push({
        segmentId,
        u,
        refTMs: r.tMs,
        userTMs: us ? us.tMs : r.tMs,
        ref: { left: r.left, right: r.right },
        user: us ? { left: us.left, right: us.right } : { left: r.left, right: r.right },
      });
    }
  }
  return out;
}

export function segmentOrder(frames: readonly MotionFrame[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const f of frames) {
    if (!seen.has(f.segmentId)) {
      seen.add(f.segmentId);
      order.push(f.segmentId);
    }
  }
  return order;
}
