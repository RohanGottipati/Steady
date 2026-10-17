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

// Real JIGSAWS expert reference (data-only). Its gesture segments legitimately
// repeat, so it exercises the run-collapsed-LCS proceduralSequencing path that a
// synthetic single-pass reference does not.
export function loadJigsawsExpertReference(skill: string): ReferenceMotion {
  return parseReference(
    JSON.parse(
      readFileSync(
        join(process.cwd(), `public/references/${skill}/${skill}-jigsaws-expert-v1.json`),
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

// --- B5 perturbations (one targeted failure mode each) ---

// Drift only in the constrained Z (depth) axis — hurts depthConsistency while
// leaving the XY path intact.
export function depthDriftAttempt(ref: ReferenceMotion, d = 0.12): RecordedMotion {
  return mapFrames(ref, (t) => {
    t.position = { ...t.position, z: t.position.z + d };
    t.tipPosition = { ...t.tipPosition, z: t.tipPosition.z + d };
    return t;
  });
}

// A large excursion off the path in the middle third, then recovery — hurts
// correctionEfficiency (time spent off-path) without a constant global offset.
export function deviateAndRecoverAttempt(ref: ReferenceMotion, d = 0.3): RecordedMotion {
  const n = ref.frames.length;
  return mapFrames(ref, (t, { index }) => {
    const off = index >= Math.floor(n / 3) && index < Math.floor((2 * n) / 3);
    if (off) {
      t.position = { x: t.position.x + d, y: t.position.y, z: t.position.z };
      t.tipPosition = { x: t.tipPosition.x + d, y: t.tipPosition.y, z: t.tipPosition.z };
    }
    return t;
  });
}

// Oscillate the tip back and forth along X — extra target crossings/reversals
// hurt overshootControl.
export function overshootAttempt(ref: ReferenceMotion, amp = 0.12): RecordedMotion {
  return mapFrames(ref, (t, { index }) => {
    const wobble = (index % 2 === 0 ? 1 : -1) * amp;
    t.position = { x: t.position.x + wobble, y: t.position.y, z: t.position.z };
    t.tipPosition = { x: t.tipPosition.x + wobble, y: t.tipPosition.y, z: t.tipPosition.z };
    return t;
  });
}

// Scale the tool *position* around its own mean so the hand ranges over a much
// larger workspace than needed — hurts handWorkspaceControl. A constant offset
// (translatedAttempt) must NOT trigger this.
export function wideWorkspaceAttempt(ref: ReferenceMotion, factor = 2): RecordedMotion {
  const meanOf = (side: "leftTool" | "rightTool") => {
    const ps = ref.frames.map((f) => f[side].position);
    return {
      x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
      y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
      z: ps.reduce((a, p) => a + p.z, 0) / ps.length,
    };
  };
  const mL = meanOf("leftTool");
  const mR = meanOf("rightTool");
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f) => {
      const scale = (p: typeof mL, m: typeof mL) => ({
        x: m.x + (p.x - m.x) * factor,
        y: m.y + (p.y - m.y) * factor,
        z: p.z,
      });
      return {
        ...f,
        leftTool: { ...f.leftTool, position: scale(f.leftTool.position, mL) },
        rightTool: { ...f.rightTool, position: scale(f.rightTool.position, mR) },
      };
    }),
  };
}

// Offset ONLY the left tool — breaks the left/right relative transform and hurts
// bimanualCoordination. Translating both tools equally must NOT trigger this.
export function bimanualDesyncAttempt(ref: ReferenceMotion, d = 0.2): RecordedMotion {
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f) => ({
      ...f,
      leftTool: {
        ...f.leftTool,
        position: { x: f.leftTool.position.x + d, y: f.leftTool.position.y, z: f.leftTool.position.z },
        tipPosition: { x: f.leftTool.tipPosition.x + d, y: f.leftTool.tipPosition.y, z: f.leftTool.tipPosition.z },
      },
    })),
  };
}

// Insert stationary dwell frames inside each segment — unnecessary pauses hurt
// idleTimeControl.
export function idleAttempt(ref: ReferenceMotion, dwellPerFrame = 2): RecordedMotion {
  const frames: RecordedMotion["frames"] = [];
  let tMs = 0;
  const step = 1000 / ref.fps;
  for (const f of ref.frames) {
    frames.push({ ...f, tMs });
    tMs += step;
    for (let d = 0; d < dwellPerFrame; d++) {
      frames.push({ ...f, tMs }); // same pose, advancing time => idle
      tMs += step;
    }
  }
  return { skillId: ref.skillId, frames };
}

// Drive both tool tips to a common midpoint so they collide — hurts
// toolCollisionAvoidance.
export function collisionAttempt(ref: ReferenceMotion): RecordedMotion {
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f) => {
      const mid = {
        x: (f.leftTool.tipPosition.x + f.rightTool.tipPosition.x) / 2,
        y: (f.leftTool.tipPosition.y + f.rightTool.tipPosition.y) / 2,
        z: (f.leftTool.tipPosition.z + f.rightTool.tipPosition.z) / 2,
      };
      return {
        ...f,
        leftTool: { ...f.leftTool, tipPosition: { ...mid }, position: { ...mid } },
        rightTool: { ...f.rightTool, tipPosition: { ...mid }, position: { ...mid } },
      };
    }),
  };
}

// Flip the left jaw state on alternating frames — grip chatter hurts pinchStability.
export function unstableGripAttempt(ref: ReferenceMotion): RecordedMotion {
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f, i) => ({
      ...f,
      leftTool: { ...f.leftTool, jawClosed: i % 2 === 0 ? !f.leftTool.jawClosed : f.leftTool.jawClosed },
    })),
  };
}

// Shift the jaw-closed timeline later by `shift` frames — hurts gripTiming.
export function lateGripAttempt(ref: ReferenceMotion, shift = 3): RecordedMotion {
  return {
    skillId: ref.skillId,
    frames: ref.frames.map((f, i) => {
      const src = ref.frames[Math.max(0, i - shift)];
      return {
        ...f,
        leftTool: { ...f.leftTool, jawClosed: src.leftTool.jawClosed },
        rightTool: { ...f.rightTool, jawClosed: src.rightTool.jawClosed },
      };
    }),
  };
}

// A danger-zone sphere and an attempt that drives the tips through it. Danger
// zones are an optional scene input (real geometry arrives with A4); with none
// supplied the metric is a perfect 100.
export const DANGER_ZONE = { center: { x: 0.2, y: 0.1, z: 0.2 }, radius: 0.12 };

export function enterDangerZoneAttempt(ref: ReferenceMotion): RecordedMotion {
  return mapFrames(ref, (t) => {
    t.tipPosition = { ...DANGER_ZONE.center };
    t.position = { ...DANGER_ZONE.center };
    return t;
  });
}
