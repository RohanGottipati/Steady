import type { Handedness } from "@/types";
import type { RawTrackedHand, TrackingSnapshot } from "@/lib/vision/types";
import type { HandControlsController } from "@/lib/vision/hand-controls";

export const cameraSize = { width: 1280, height: 720 };
export interface HandOptions { x?: number; y?: number; ratio?: number; scale?: number; rotationZ?: number; confidence?: number }

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
  const worldLandmarks = world.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z }));
  const center = [0, 5, 9, 17].reduce((sum, i) => ({ x: sum.x + worldLandmarks[i].x / 4, y: sum.y + worldLandmarks[i].y / 4 }), { x: 0, y: 0 });
  const landmarks = worldLandmarks.map(p => ({ x: x + (p.x - center.x) * 2 * scale / (1280 / 720), y: y + (p.y - center.y) * 2 * scale, z: p.z * 2 * scale }));
  return { handedness: label, handednessConfidence: confidence, landmarks, worldLandmarks, palmCenter: { x, y, z: 0 } };
}

export function controlFrame(tMs: number, left: HandOptions = {}, right: HandOptions = {}): TrackingSnapshot {
  return { tMs, left: controlHand("Left", left), right: controlHand("Right", right) };
}

export function calibrateControls(controller: HandControlsController, start = 0) {
  let time = start;
  controller.beginCalibration(time, cameraSize);
  for (let i = 0; i < 22; i++) { time += 40; controller.update(controlFrame(time), time, cameraSize); }
  for (let i = 0; i < 22; i++) { time += 40; controller.update(controlFrame(time, { ratio: 0.1 }, { ratio: 0.15 }), time, cameraSize); }
  for (let i = 0; i < 48; i++) {
    time += 40;
    const angle = i / 44 * Math.PI * 2;
    controller.update(controlFrame(time, { x: 0.7 + 0.08 * Math.cos(angle), y: 0.5 + 0.08 * Math.sin(angle) },
      { x: 0.3 + 0.08 * Math.cos(angle), y: 0.5 + 0.08 * Math.sin(angle) }), time, cameraSize);
  }
  return time;
}
