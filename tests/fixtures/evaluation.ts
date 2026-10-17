import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReference } from "@/lib/references/load-reference";
import type { RecordedMotion } from "@/lib/evaluation/types";
import type { ReferenceMotion } from "@/types/motion";
import type { ToolState } from "@/types/tool";

export function loadNeedleReference(): ReferenceMotion {
  return parseReference(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "public/references/needle-passing/needle-passing-reference-v1.json"),
        "utf8",
      ),
    ),
  );
}

// Deterministic PRNG so "jitter" fixtures are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneTool(t: ToolState): ToolState {
  return {
    ...t,
    position: { ...t.position },
    rotation: { ...t.rotation },
    tipPosition: { ...t.tipPosition },
  };
}

function mapFrames(
  ref: ReferenceMotion,
  fn: (tool: ToolState, ctx: { index: number; progress: number }) => ToolState,
): RecordedMotion {
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f, index) => ({
      ...f,
      leftTool: fn(cloneTool(f.leftTool), { index, progress: f.normalizedProgress }),
      rightTool: fn(cloneTool(f.rightTool), { index, progress: f.normalizedProgress }),
    })),
  };
}

// Perfect clone of the reference — should score highest.
export function perfectAttempt(ref: ReferenceMotion): RecordedMotion {
  return mapFrames(ref, (t) => t);
}

// Whole trajectory translated by a fixed offset — hurts path/target/efficiency,
// leaves orientation untouched.
export function translatedAttempt(ref: ReferenceMotion, d = 0.08): RecordedMotion {
  return mapFrames(ref, (t) => {
    t.position = { x: t.position.x + d, y: t.position.y + d, z: t.position.z };
    t.tipPosition = { x: t.tipPosition.x + d, y: t.tipPosition.y + d, z: t.tipPosition.z };
    return t;
  });
}

// Orientation stays at identity late in the motion (user fails to rotate),
// hurting orientation accuracy while leaving positions correct.
export function lateRotationAttempt(ref: ReferenceMotion): RecordedMotion {
  return mapFrames(ref, (t, { progress }) => {
    if (progress > 0.4) t.rotation = { x: 0, y: 0, z: 0, w: 1 };
    return t;
  });
}

// High-frequency positional noise — hurts smoothness, roughly preserves the
// overall path.
export function jitterAttempt(ref: ReferenceMotion, seed = 1, amp = 0.05): RecordedMotion {
  const rng = mulberry32(seed);
  return mapFrames(ref, (t) => {
    const n = () => (rng() - 0.5) * 2 * amp;
    t.position = { x: t.position.x + n(), y: t.position.y + n(), z: t.position.z + n() };
    t.tipPosition = { x: t.tipPosition.x + n(), y: t.tipPosition.y + n(), z: t.tipPosition.z + n() };
    return t;
  });
}

// Reverse the segment label order on the back half — breaks procedural order.
export function wrongSequenceAttempt(ref: ReferenceMotion): RecordedMotion {
  const order = [...new Set(ref.frames.map((f) => f.segmentId))];
  const reversed = new Map(order.map((id, i) => [id, order[order.length - 1 - i]]));
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f) => ({ ...f, segmentId: reversed.get(f.segmentId) ?? f.segmentId })),
  };
}
