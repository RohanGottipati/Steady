import { Quaternion, Vector3 } from "three";
import { TIP_OFFSET } from "@/lib/simulation/tool-simulation";
import type { ControlSnapshot, ToolControlTarget } from "@/lib/vision/control-types";
import type { HandFrame, Quat, Vec3 } from "@/types";
import { corridorArcPoint, NEEDLE_PASSING_RINGS, RELEASE_ZONE } from "./needle-passing-config";

export type FixtureId = "needle-pass-good" | "needle-pass-late-rotation";

export interface FixtureCatalogItem {
  id: FixtureId;
  label: string;
  description: string;
}

export const FIXTURE_CATALOG: readonly FixtureCatalogItem[] = [
  {
    id: "needle-pass-good",
    label: "Good Pass (Scene-aligned)",
    description: "Smooth corridor trajectory and progressive wrist rotation through Rings 1–3.",
  },
  {
    id: "needle-pass-late-rotation",
    label: "Late Wrist Rotation (Perturbed)",
    description: "Holds a misaligned wrist angle, hesitates, and drifts off-corridor before a late rotation snap at Ring 2.",
  },
] as const;

export function resolveFixtureIdFromSearch(
  search: string,
  demoEnvEnabled = process.env.NEXT_PUBLIC_DEMO_FIXTURE_MODE === "true",
): FixtureId | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("fixture")?.trim().toLowerCase();
  if (raw === "needle-pass-good" || raw === "good" || raw === "1" || raw === "true") {
    return "needle-pass-good";
  }
  if (raw === "needle-pass-late-rotation" || raw === "late-rotation") {
    return "needle-pass-late-rotation";
  }
  if (raw === "off" || raw === "false" || raw === "0") return null;
  if (demoEnvEnabled) {
    return "needle-pass-good";
  }
  return null;
}

function zQuatDeg(deg: number): Quat {
  const rad = (deg * Math.PI) / 180;
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rad).normalize();
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function lerpVec3(a: Vec3, b: Vec3, u: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

function targetForTip(
  side: "left" | "right",
  tip: Vec3,
  closed: boolean,
  rotation: Quat,
): ToolControlTarget {
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  const offset = new Vector3(TIP_OFFSET.x, TIP_OFFSET.y, TIP_OFFSET.z).applyQuaternion(q);
  return {
    id: side === "left" ? "left-tool" : "right-tool",
    position: {
      x: tip.x - offset.x,
      y: tip.y - offset.y,
      z: tip.z - offset.z,
    },
    rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    jawClosed: closed,
  };
}

function syntheticHandFrame(
  handedness: "Left" | "Right",
  palmCenter: Vec3,
  palmRotation: Quat,
  jawClosed: boolean,
): HandFrame {
  const landmarks = Array.from({ length: 21 }, (_, idx) => ({
    x: Math.min(0.95, Math.max(0.05, 0.5 + palmCenter.x * 0.3 + idx * 0.002)),
    y: Math.min(0.95, Math.max(0.05, 0.5 - palmCenter.y * 0.3 + idx * 0.002)),
    z: palmCenter.z,
  }));
  const worldLandmarks = Array.from({ length: 21 }, (_, idx) => ({
    x: idx * 0.004,
    y: idx * 0.004,
    z: 0,
  }));
  return {
    handedness,
    confidence: 0.99,
    landmarks,
    worldLandmarks,
    palmCenter: { ...palmCenter },
    palmRotation: { ...palmRotation },
    pinchRatio: jawClosed ? 0.18 : 0.72,
    isPinching: jawClosed,
  };
}

function makeControlFrame(
  tMs: number,
  leftTip: Vec3,
  leftClosed: boolean,
  leftRotDeg: number,
  rightTip: Vec3 = { x: 0.42, y: 0.28, z: 0 },
  rightClosed = false,
  rightRotDeg = 0,
): ControlSnapshot {
  const leftRot = zQuatDeg(leftRotDeg);
  const rightRot = zQuatDeg(rightRotDeg);
  const leftTarget = targetForTip("left", leftTip, leftClosed, leftRot);
  const rightTarget = targetForTip("right", rightTip, rightClosed, rightRot);
  return {
    sourceTMs: tMs,
    calibrated: true,
    canProgress: true,
    left: {
      status: "tracking",
      lastSeenMs: tMs,
      rotationHeld: false,
      hand: syntheticHandFrame("Left", leftTarget.position, leftRot, leftClosed),
      target: leftTarget,
    },
    right: {
      status: "tracking",
      lastSeenMs: tMs,
      rotationHeld: false,
      hand: syntheticHandFrame("Right", rightTarget.position, rightRot, rightClosed),
      target: rightTarget,
    },
  };
}

interface RawWaypoint {
  tip: Vec3;
  closed: boolean;
  rotDeg: number;
  rightTip?: Vec3;
}

/**
 * Build a 30 Hz sequence of calibrated `ControlSnapshot` frames for the requested
 * fixture ID. Both fixtures traverse all 8 Needle Passing segments through the
 * real `ToolSimulationController` and `ExerciseController`.
 */
export function buildFixtureControlFrames(
  fixtureId: FixtureId,
  startTMs = 33.333,
): ControlSnapshot[] {
  const needleStart: Vec3 = { x: 0, y: 0.35, z: 0 };
  const ring3 = NEEDLE_PASSING_RINGS[2].position;
  const releasePos = RELEASE_ZONE.position;
  const restLeft: Vec3 = { x: -0.36, y: 0.35, z: 0 };
  const approachEdge: Vec3 = { x: -0.242, y: 0.35, z: 0 };
  const preAlign: Vec3 = { x: -0.04, y: 0.335, z: 0 };
  const alignStart: Vec3 = { x: -0.05, y: 0.325, z: 0 };
  const alignEdge: Vec3 = { x: -0.075, y: 0.312, z: 0 };
  const exitEdge: Vec3 = { x: 0.18, y: 0.258, z: 0 };

  const samples: RawWaypoint[] = [];
  const pushSpan = (
    count: number,
    evalStep: (u: number, index: number) => RawWaypoint,
  ) => {
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 1;
      samples.push(evalStep(u, i));
    }
  };

  if (fixtureId === "needle-pass-good") {
    // 1. Approach (10 frames): outside 0.24 approachRadius
    pushSpan(10, u => ({
      tip: lerpVec3(restLeft, approachEdge, u),
      closed: false,
      rotDeg: 0,
    }));

    // 2. Grip (14 frames): enter approachRadius -> reach needleStart -> close jaws -> carry toward Ring 1
    pushSpan(14, (_u, idx) => {
      if (idx < 4) {
        return {
          tip: lerpVec3({ x: -0.2, y: 0.35, z: 0 }, needleStart, idx / 3),
          closed: false,
          rotDeg: 0,
        };
      }
      const carryU = (idx - 4) / 9;
      return {
        tip: lerpVec3(needleStart, preAlign, carryU),
        closed: true,
        rotDeg: -6 * carryU,
      };
    });

    // 3. Align (8 frames): inside 0.15 alignRadius, outside 0.11 gateRadius
    pushSpan(8, u => ({
      tip: lerpVec3(alignStart, alignEdge, u),
      closed: true,
      rotDeg: -6 - 2.6 * u,
    }));

    // 4. Entry (14 frames): cross Ring 1 at idx 0, then curve along corridor with x < -0.08
    pushSpan(14, u => ({
      tip: corridorArcPoint(0.24 * u),
      closed: true,
      rotDeg: -8.6 + 4.6 * u,
    }));

    // 5. Rotation (20 frames): enter Ring 2 engagement zone (u=0.28..0.68), pass Ring 2 (u=0.5), rotate wrist to +20 deg
    pushSpan(20, u => ({
      tip: corridorArcPoint(0.28 + 0.4 * u),
      closed: true,
      rotDeg: -4 + 24 * u,
    }));

    // 6. Exit (12 frames): cross Ring 3 (u=0.75..1.0) and pull toward Release Zone (stopping outside 0.10 releaseRadius)
    pushSpan(12, (_u, idx) => {
      if (idx < 4) {
        const arcU = 0.75 + 0.25 * (idx / 3);
        return {
          tip: corridorArcPoint(arcU),
          closed: true,
          rotDeg: 20,
        };
      }
      const pullU = (idx - 4) / 7;
      return {
        tip: lerpVec3(ring3, exitEdge, pullU),
        closed: true,
        rotDeg: 20 - 12 * pullU,
      };
    });

    // 7. Release (8 frames): enter Release Zone (0.20, 0.36, 0) while holding needle
    pushSpan(8, u => ({
      tip: lerpVec3({ x: 0.192, y: 0.33, z: 0 }, releasePos, u),
      closed: true,
      rotDeg: 8 * (1 - u),
    }));

    // 8. Complete (1 terminal frame): open jaws inside Release Zone
    pushSpan(1, () => ({
      tip: releasePos,
      closed: false,
      rotDeg: 0,
    }));
  } else {
    // needle-pass-late-rotation:
    // Holds a misaligned wrist angle (-38 deg), oscillates/drifts off-corridor, and stalls at Ring 2
    // before making a sudden late wrist twist (+24 deg), hurting orientation, rotation, path, stability, and timing.
    pushSpan(10, (u, idx) => ({
      tip: {
        x: restLeft.x + (approachEdge.x - restLeft.x) * u,
        y: 0.35 + (idx % 2 === 0 ? 0.04 : -0.04),
        z: 0,
      },
      closed: false,
      rotDeg: -38 * u,
      rightTip: { x: 0.48 + (idx % 2 === 0 ? 0.04 : -0.04), y: 0.22, z: 0 },
    }));

    pushSpan(14, (u, idx) => {
      if (idx < 4) {
        return {
          tip: lerpVec3({ x: -0.2, y: 0.35, z: 0 }, needleStart, idx / 3),
          closed: false,
          rotDeg: -38,
          rightTip: { x: 0.52, y: 0.18, z: 0 },
        };
      }
      const carryU = (idx - 4) / 9;
      return {
        tip: {
          x: needleStart.x + (preAlign.x - needleStart.x) * carryU,
          y: 0.44,
          z: 0,
        },
        closed: true,
        rotDeg: -38,
        rightTip: { x: 0.52, y: 0.18, z: 0 },
      };
    });

    pushSpan(8, () => ({
      tip: alignEdge,
      closed: true,
      rotDeg: -38,
      rightTip: { x: 0.52, y: 0.18, z: 0 },
    }));

    pushSpan(16, (_u, idx) => {
      if (idx === 0) {
        return {
          tip: NEEDLE_PASSING_RINGS[0].position,
          closed: true,
          rotDeg: -38,
          rightTip: { x: 0.54, y: 0.16, z: 0 },
        };
      }
      const u = idx / 15;
      const base = corridorArcPoint(0.24 * u);
      const wobble = (idx % 2 === 0 ? 1 : -1) * 0.035;
      return {
        tip: { x: base.x, y: base.y + 0.14 + wobble, z: 0 },
        closed: true,
        rotDeg: -38,
        rightTip: { x: 0.54, y: 0.16, z: 0 },
      };
    });

    pushSpan(24, (_u, idx) => {
      if (idx === 0) {
        return {
          tip: corridorArcPoint(0.28),
          closed: true,
          rotDeg: -38,
          rightTip: { x: 0.54, y: 0.16, z: 0 },
        };
      }
      if (idx < 14) {
        return {
          tip: NEEDLE_PASSING_RINGS[1].position,
          closed: true,
          rotDeg: -38,
          rightTip: { x: 0.54, y: 0.16, z: 0 },
        };
      }
      if (idx === 14) {
        return {
          tip: NEEDLE_PASSING_RINGS[1].position,
          closed: true,
          rotDeg: 24,
          rightTip: { x: 0.54, y: 0.16, z: 0 },
        };
      }
      const postU = (idx - 14) / 9;
      const base = corridorArcPoint(0.5 + 0.18 * postU);
      const wobble = (idx % 2 === 0 ? 1 : -1) * 0.04;
      return {
        tip: { x: base.x, y: base.y + 0.12 + wobble, z: 0 },
        closed: true,
        rotDeg: -36,
        rightTip: { x: 0.54, y: 0.16, z: 0 },
      };
    });

    pushSpan(12, (_u, idx) => {
      if (idx === 0) {
        return {
          tip: ring3,
          closed: true,
          rotDeg: -36,
          rightTip: { x: 0.54, y: 0.16, z: 0 },
        };
      }
      const pullU = idx / 11;
      return {
        tip: {
          x: ring3.x + 0.1 * Math.sin(pullU * Math.PI),
          y: ring3.y + (exitEdge.y - ring3.y) * pullU + 0.08 * Math.sin(pullU * Math.PI),
          z: 0,
        },
        closed: true,
        rotDeg: -36,
        rightTip: { x: 0.54, y: 0.16, z: 0 },
      };
    });

    pushSpan(8, () => ({
      tip: releasePos,
      closed: true,
      rotDeg: -36,
      rightTip: { x: 0.54, y: 0.16, z: 0 },
    }));

    pushSpan(1, () => ({
      tip: releasePos,
      closed: false,
      rotDeg: -36,
      rightTip: { x: 0.54, y: 0.16, z: 0 },
    }));
  }

  const stepMs = 1000 / 30;
  return samples.map((sample, index) =>
    makeControlFrame(
      startTMs + index * stepMs,
      sample.tip,
      sample.closed,
      sample.rotDeg,
      sample.rightTip,
    ),
  );
}
