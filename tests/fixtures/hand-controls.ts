import type { Handedness, Quat } from "@/types";
import type { RawTrackedHand, TrackingSnapshot } from "@/lib/vision/types";
import type { HandControlsController } from "@/lib/vision/hand-controls";

export const cameraSize = { width: 1280, height: 720 };
export interface HandOptions { x?: number; y?: number; ratio?: number; scale?: number; rotationZ?: number; rotation?: Quat; confidence?: number }

/** Nondegenerate synthetic anatomy, not a recorded or medically validated hand.
 * Self-contained so Playwright can install the same generator in its fake worker.
 */
export function controlHand(label: Handedness, options: HandOptions = {}): RawTrackedHand {
  const { x = label === "Left" ? 0.7 : 0.3, y = 0.5, ratio = 0.9, scale = 1, rotationZ = 0, confidence = 0.99 } = options;
  const side = label === "Left" ? -1 : 1;
  const world = Array.from({ length: 21 }, (_, i) => ({ x: side * ((i % 4) - 1.5) * 0.02, y: -Math.floor(i / 4) * 0.02, z: 0.002 * (i % 3) }));
  world[0] = { x: 0, y: 0.06, z: 0 };
  world[5] = { x: -side * 0.035, y: 0, z: 0 };
  world[9] = { x: 0, y: -0.01, z: 0 };
  world[17] = { x: side * 0.035, y: 0, z: 0 };
  world[4] = { x: -side * 0.015, y: -0.04, z: -0.005 };
  world[8] = { x: side * (-0.015 + ratio * 0.07), y: -0.04, z: -0.005 };
  const c = Math.cos(rotationZ), s = Math.sin(rotationZ);
  // Self-contained quaternion application: this function is serialized into the
  // browser worker fixture, so it must not close over Three.js or other helpers.
  const q = options.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  const worldLandmarks = world.map(p => {
    const tx = 2 * (q.y * p.z - q.z * p.y), ty = 2 * (q.z * p.x - q.x * p.z), tz = 2 * (q.x * p.y - q.y * p.x);
    const rx = p.x + q.w * tx + q.y * tz - q.z * ty;
    const ry = p.y + q.w * ty + q.z * tx - q.x * tz;
    return { x: rx * c - ry * s, y: rx * s + ry * c, z: p.z + q.w * tz + q.x * ty - q.y * tx };
  });
  const center = [0, 5, 9, 17].reduce((sum, i) => ({ x: sum.x + worldLandmarks[i].x / 4, y: sum.y + worldLandmarks[i].y / 4 }), { x: 0, y: 0 });
  const landmarks = worldLandmarks.map(p => ({ x: x + (p.x - center.x) * 2 * scale / (1280 / 720), y: y + (p.y - center.y) * 2 * scale, z: p.z * 2 * scale }));
  return { handedness: label, handednessConfidence: confidence, landmarks, worldLandmarks, palmCenter: { x, y, z: 0 } };
}

export function controlFrame(tMs: number, left: HandOptions = {}, right: HandOptions = {}): TrackingSnapshot {
  return { tMs, left: controlHand("Left", left), right: controlHand("Right", right) };
}

export function calibrateControls(controller: HandControlsController, start = 0, left: HandOptions = {}, right: HandOptions = {}) {
  let time = start;
  controller.beginCalibration(time, cameraSize);
  for (let i = 0; i < 32; i++) { time += 40; controller.update(controlFrame(time, left, right), time, cameraSize); }
  for (let i = 0; i < 22; i++) { time += 40; controller.update(controlFrame(time, { ...left, ratio: 0.1 }, { ...right, ratio: 0.15 }), time, cameraSize); }
  for (let i = 0; i < 48; i++) {
    time += 40;
    const angle = i / 44 * Math.PI * 2;
    controller.update(controlFrame(time, { ...left, x: (left.x ?? 0.7) + 0.08 * Math.cos(angle), y: (left.y ?? 0.5) + 0.08 * Math.sin(angle) },
      { ...right, x: (right.x ?? 0.3) + 0.08 * Math.cos(angle), y: (right.y ?? 0.5) + 0.08 * Math.sin(angle) }), time, cameraSize);
  }
  return time;
}
