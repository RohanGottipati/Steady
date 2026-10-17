import { describe, expect, it } from "vitest";
import { Quaternion } from "three";
import { OneEuroFilter } from "@/lib/filters/one-euro";
import { measureHand, quaternion, relativeRotation } from "@/lib/vision/hand-geometry";
import { PinchHysteresis } from "@/lib/vision/pinch";
import { cameraSize, controlHand } from "../fixtures/hand-controls";

describe("timestamp-based One Euro filter", () => {
  it("initializes at zero, rejects invalid input and ignores reordered samples without poisoning state", () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(0, 0)).toBe(0);
    expect(filter.filter(NaN, 20)).toBeNull();
    expect(filter.filter(100, -1)).toBe(0);
    expect(filter.filter(100, 0)).toBe(0);
    expect(filter.filter(1, 40)).toBeGreaterThan(0);
    filter.reset(); expect(filter.filter(5, 1)).toBe(5);
    expect(() => new OneEuroFilter({ beta: -1 })).toThrow();
    expect(() => new OneEuroFilter({ minCutoff: 0 })).toThrow();
  });
  it("reduces stationary jitter while adapting to intentional fast movement", () => {
    const adaptive = new OneEuroFilter({ beta: 1 });
    const fixed = new OneEuroFilter({ beta: 0 });
    let jitter = 0;
    for (let i = 0; i < 100; i++) {
      const value = (i % 2 ? 1 : -1) * 0.01;
      const filtered = adaptive.filter(value, i * 40)!;
      fixed.filter(value, i * 40);
      if (i > 20) jitter += filtered ** 2;
    }
    expect(Math.sqrt(jitter / 79)).toBeLessThan(0.005);
    expect(adaptive.filter(1, 4000)).toBeGreaterThan(fixed.filter(1, 4000)!);
  });
  it("uses actual elapsed time and reseeds derivatives after a gap", () => {
    const fast = new OneEuroFilter({ beta: 0 }), slow = new OneEuroFilter({ beta: 0 });
    fast.filter(0, 0); slow.filter(0, 0);
    expect(slow.filter(1, 100)).toBeGreaterThan(fast.filter(1, 10)!);
    fast.reset(0.2, 10_000);
    expect(fast.filter(0.2, 10_040)).toBe(0.2);
  });
  it("rejects finite inputs that overflow arithmetic without poisoning subsequent samples", () => {
    const filter = new OneEuroFilter();
    filter.filter(0, 0);
    expect(filter.filter(Number.MAX_VALUE, 1)).toBeNull();
    expect(Number.isFinite(filter.filter(0.1, 40))).toBe(true);
  });
});

describe("palm geometry", () => {
  it("recovers pinch and orthonormal orientations for both anatomical hand shapes", () => {
    for (const label of ["Left", "Right"] as const) {
      const hand = controlHand(label, { ratio: 0.2 });
      const before = JSON.stringify(hand);
      const measured = measureHand(hand, cameraSize)!;
      expect(measured.pinchRatio).toBeCloseTo(0.2);
      expect(quaternion(measured.rotation).length()).toBeCloseTo(1);
      const rotated = measureHand(controlHand(label, { rotationZ: Math.PI / 6 }), cameraSize)!;
      const relative = relativeRotation(rotated.rotation, measured.rotation, Math.PI / 2);
      expect(quaternion(relative).angleTo(new Quaternion(0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)))).toBeLessThan(1e-6);
      expect(JSON.stringify(hand)).toBe(before);
    }
  });
  it("corrects image aspect ratio without claiming world coordinates provide global translation", () => {
    const hand = controlHand("Right");
    const widescreen = measureHand(hand, cameraSize)!;
    hand.landmarks.forEach(p => { p.x = hand.palmCenter.x + (p.x - hand.palmCenter.x) * (16 / 9) / (4 / 3); });
    expect(measureHand(hand, { width: 640, height: 480 })!.palmScale).toBeCloseTo(widescreen.palmScale);
    expect(measureHand(controlHand("Right", { scale: 2 }), cameraSize)!.pinchRatio).toBeCloseTo(widescreen.pinchRatio);
  });
  it("rejects malformed, nonfinite and collinear input", () => {
    const hand = controlHand("Left");
    expect(measureHand(hand, { width: 0, height: 720 })).toBeNull();
    hand.worldLandmarks[9] = { ...hand.worldLandmarks[0] };
    expect(measureHand(hand, cameraSize)).toBeNull();
    hand.worldLandmarks[0].x = Infinity;
    expect(measureHand(hand, cameraSize)).toBeNull();
    hand.worldLandmarks.pop();
    expect(measureHand(hand, cameraSize)).toBeNull();
    const overflowing = controlHand("Left");
    overflowing.worldLandmarks[5].x = Number.MAX_VALUE;
    expect(measureHand(overflowing, cameraSize)).toBeNull();
  });
  it("handles equivalent quaternion signs and clamps relative rotation", () => {
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    expect(quaternion(relativeRotation({ x: 0, y: 0, z: 0, w: -1 }, identity, Math.PI / 2)).angleTo(new Quaternion())).toBe(0);
    const limited = relativeRotation({ x: 1, y: 0, z: 0, w: 0 }, identity, Math.PI / 2);
    expect(new Quaternion().angleTo(quaternion(limited))).toBeCloseTo(Math.PI / 2);
  });
});

describe("pinch hysteresis", () => {
  it("requires sustained observations, keeps state in the deadband, and respects strict thresholds", () => {
    const pinch = new PinchHysteresis();
    for (const t of [0, 40, 80]) expect(pinch.update(0.1, t, 0.28, 0.4)).toBe(false);
    expect(pinch.update(0.1, 120, 0.28, 0.4)).toBe(true);
    expect(pinch.update(0.4, 160, 0.28, 0.4)).toBe(true);
    for (const t of [200, 240, 280]) expect(pinch.update(0.9, t, 0.28, 0.4)).toBe(true);
    expect(pinch.update(0.9, 320, 0.28, 0.4)).toBe(false);
    for (let i = 0; i < 40; i++) expect(pinch.update(i % 2 ? 0.27 : 0.3, 360 + i * 40, 0.28, 0.4)).toBe(false);
  });
  it("does not count duplicate timestamps or tracking gaps as stable evidence", () => {
    const pinch = new PinchHysteresis(true);
    pinch.update(0.9, 0, 0.28, 0.4);
    expect(pinch.update(0.9, 0, 0.28, 0.4)).toBe(true);
    expect(pinch.update(0.9, 5000, 0.28, 0.4)).toBe(true);
    pinch.interrupt();
    expect(pinch.update(0.9, 5100, 0.28, 0.4)).toBe(true);
    expect(pinch.update(NaN, 5200, 0.28, 0.4)).toBe(true);
  });
  it("interrupts a pending transition on an invalid intervening observation", () => {
    const pinch = new PinchHysteresis();
    pinch.update(0.1, 0, 0.28, 0.4);
    pinch.update(NaN, 40, 0.28, 0.4);
    pinch.update(0.1, 80, 0.28, 0.4);
    pinch.update(0.1, 120, 0.28, 0.4);
    expect(pinch.update(0.1, 160, 0.28, 0.4)).toBe(false);
    expect(pinch.update(0.1, 200, 0.28, 0.4)).toBe(true);
  });
});
