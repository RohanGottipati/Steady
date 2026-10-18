import { describe, expect, it } from "vitest";
import { Euler, Quaternion, Vector3 } from "three";
import { NeutralPoseCapture } from "@/lib/vision/calibration";
import { HandControlsController } from "@/lib/vision/hand-controls";
import { handRelativeRotation, measureHand, plainQuat, quaternion, SURGICAL_ROTATION_LIMITS, surgicalToolRotation } from "@/lib/vision/hand-geometry";
import { calibrateControls, cameraSize, controlFrame, controlHand } from "../fixtures/hand-controls";

const axes = { pitch: new Vector3(1, 0, 0), roll: new Vector3(0, 1, 0), yaw: new Vector3(0, 0, 1) };
const posture = (side: "Left" | "Right") => new Quaternion().setFromAxisAngle(axes.yaw, side === "Left" ? 0.15 : -0.15)
  .multiply(new Quaternion().setFromAxisAngle(axes.pitch, -Math.PI * 0.42));

describe("surgical hand basis and local tool mapping", () => {
  it.each(["Left", "Right"] as const)("maps %s palm-down/inward neutral and all three wrist axes into tool axes", side => {
    const slot = side === "Left" ? "left" : "right";
    const neutral = measureHand(controlHand(side, { rotation: plainQuat(posture(side)) }), cameraSize, true)!;
    expect(quaternion(surgicalToolRotation(neutral.rotation, neutral.rotation, Math.PI / 2, slot)).angleTo(new Quaternion())).toBeLessThan(1e-7);
    for (const axis of Object.values(axes)) {
      const expected = new Quaternion().setFromAxisAngle(axis, 0.3);
      const current = measureHand(controlHand(side, { rotation: plainQuat(posture(side).multiply(expected)) }), cameraSize, true)!;
      const tool = quaternion(surgicalToolRotation(current.rotation, neutral.rotation, Math.PI / 2, slot));
      const expectedTool = axis === axes.yaw ? expected.clone().invert() : expected;
      expect(tool.angleTo(expectedTool)).toBeLessThan(1e-7);
    }
    const compound = new Quaternion().setFromEuler(new Euler(0.15, -0.25, 0.2, "YXZ"));
    const current = measureHand(controlHand(side, { rotation: plainQuat(posture(side).multiply(compound)) }), cameraSize, true)!;
    const expectedTool = new Quaternion().setFromEuler(new Euler(0.15, -0.25, -0.2, "YXZ"));
    expect(quaternion(surgicalToolRotation(current.rotation, neutral.rotation, Math.PI / 2, slot)).angleTo(expectedTool)).toBeLessThan(1e-7);
  });

  it.each(["Left", "Right"] as const)("corrects both directions of %s lateral sweep without coupling translation into rotation", side => {
    const slot = side === "Left" ? "left" : "right";
    const neutral = measureHand(controlHand(side, { rotation: plainQuat(posture(side)) }), cameraSize, true)!;
    for (const angle of [-0.35, 0.35]) {
      const current = measureHand(controlHand(side, { rotation: plainQuat(posture(side).multiply(new Quaternion().setFromAxisAngle(axes.yaw, angle))) }), cameraSize, true)!;
      const tool = quaternion(surgicalToolRotation(current.rotation, neutral.rotation, Math.PI / 2, slot));
      const tip = new Vector3(0, 0.35, 0).applyQuaternion(tool);
      expect(Math.sign(tip.x)).toBe(Math.sign(angle));
    }
    const translated = measureHand(controlHand(side, { x: 0.4, rotation: plainQuat(posture(side)) }), cameraSize, true)!;
    expect(quaternion(surgicalToolRotation(translated.rotation, neutral.rotation, Math.PI / 2, slot)).angleTo(new Quaternion())).toBeLessThan(1e-7);
  });

  it("uses a consistent proper basis for mirrored anatomy, preserving forward and a common normal", () => {
    const left = measureHand(controlHand("Left"), cameraSize, true)!;
    const right = measureHand(controlHand("Right"), cameraSize, true)!;
    expect(quaternion(left.rotation).angleTo(quaternion(right.rotation))).toBeLessThan(1e-7);
    for (const measurement of [left, right]) {
      const q = quaternion(measurement.rotation);
      const x = axes.pitch.clone().applyQuaternion(q), y = axes.roll.clone().applyQuaternion(q), z = axes.yaw.clone().applyQuaternion(q);
      expect(x.clone().cross(y).dot(z)).toBeCloseTo(1);
      expect(y.distanceTo(axes.roll)).toBeLessThan(1e-7);
    }
  });

  it.each(Object.entries(axes))("limits %s around its meaningful tool axis", (name, axis) => {
    const neutral = plainQuat(posture("Right"));
    const current = plainQuat(posture("Right").multiply(new Quaternion().setFromAxisAngle(axis, 100 * Math.PI / 180)));
    const rotation = quaternion(surgicalToolRotation(current, neutral, Math.PI / 2, "right"));
    // Pitch beyond 90 crosses an Euler branch; use a within-branch excursion for that axis.
    if (name === "pitch") {
      const pitch = plainQuat(posture("Right").multiply(new Quaternion().setFromAxisAngle(axis, 70 * Math.PI / 180)));
      expect(quaternion(surgicalToolRotation(pitch, neutral, Math.PI / 2, "right")).angleTo(new Quaternion())).toBeCloseTo(SURGICAL_ROTATION_LIMITS.pitch);
    } else expect(rotation.angleTo(new Quaternion())).toBeCloseTo(SURGICAL_ROTATION_LIMITS[name as "yaw" | "roll"]);
    expect(rotation.angleTo(new Quaternion())).toBeLessThanOrEqual(Math.PI / 2 + 1e-7);
  });

  it("is invariant to equivalent quaternion signs and does not mutate input calibration", () => {
    const neutral = plainQuat(posture("Left")), before = { ...neutral };
    const current = plainQuat(posture("Left").multiply(new Quaternion().setFromAxisAngle(axes.roll, 0.4)));
    const negative = { x: -current.x, y: -current.y, z: -current.z, w: -current.w };
    expect(handRelativeRotation(negative, neutral).angleTo(handRelativeRotation(current, neutral))).toBeLessThan(1e-7);
    expect(neutral).toEqual(before);
  });
});

describe("surgical neutral capture", () => {
  it("requires both enough distinct samples and enough elapsed time, and averages q/-q safely", () => {
    const capture = new NeutralPoseCapture();
    const measurement = measureHand(controlHand("Right", { rotation: plainQuat(posture("Right")), ratio: 0.4 }), cameraSize, true)!;
    for (let i = 1; i <= 29; i++) {
      const rotation = { ...measurement.rotation };
      if (i % 2) { rotation.x *= -1; rotation.y *= -1; rotation.z *= -1; rotation.w *= -1; }
      capture.update({ ...measurement, rotation }, i * 30, cameraSize);
      capture.update(measurement, i * 30, cameraSize);
    }
    expect(capture.result).toBeNull();
    capture.update(measurement, 900, cameraSize);
    expect(quaternion(capture.result!.rotation).angleTo(quaternion(measurement.rotation))).toBeLessThan(1e-7);
    const tooFast = new NeutralPoseCapture();
    for (let i = 0; i < 60; i++) tooFast.update(measurement, i * 5, cameraSize);
    expect(tooFast.result).toBeNull();
  });

  it("resets incomplete capture on gaps, unstable position, scale or orientation", () => {
    const initial = measureHand(controlHand("Left", { ratio: 0.4 }), cameraSize, true)!;
    for (const change of [
      { ...initial, center: { ...initial.center, x: initial.center.x + 0.1 } },
      { ...initial, palmScale: initial.palmScale * 1.3 },
      { ...initial, rotation: plainQuat(new Quaternion().setFromAxisAngle(axes.yaw, 0.5)) },
    ]) {
      const capture = new NeutralPoseCapture();
      for (let i = 1; i <= 20; i++) capture.update(initial, i * 40, cameraSize);
      capture.update(change, 840, cameraSize);
      expect(capture.progress).toBe(0);
      expect(capture.result).toBeNull();
    }
    const capture = new NeutralPoseCapture();
    for (let i = 1; i <= 29; i++) capture.update(initial, i * 40, cameraSize);
    capture.update(initial, 1400, cameraSize);
    expect(capture.progress).toBe(0);
  });

  it("tolerates a brief scheduling gap within tracking grace without counting missing frames", () => {
    const capture = new NeutralPoseCapture();
    const measurement = measureHand(controlHand("Right"), cameraSize, true)!;
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += i === 15 ? 160 : 40;
      capture.update(measurement, t, cameraSize);
    }
    expect(capture.result).not.toBeNull();
    const missing = new NeutralPoseCapture();
    for (let i = 1; i < 30; i++) missing.update(measurement, i * 40, cameraSize);
    missing.update(null, 1200, cameraSize);
    missing.update(measurement, 1240, cameraSize);
    expect(missing.result).toBeNull();
    expect(missing.progress).toBe(0);
  });

  it("captures hands independently without discarding the first neutral during the other hand's interruption", () => {
    const controller = new HandControlsController({}, true);
    controller.beginCalibration(0, cameraSize);
    for (let i = 1; i <= 32; i++) {
      const t = i * 40;
      controller.update({ ...controlFrame(t, { y: 0.8, ratio: 0.4 }), right: null }, t, cameraSize);
    }
    expect(controller.calibration.state.neutralHands).toEqual({ left: 1, right: 0 });
    for (let i = 33; i <= 64; i++) {
      const t = i * 40;
      controller.update(controlFrame(t, { y: 0.7, ratio: 0.4 }, { y: 0.82, ratio: 0.4 }), t, cameraSize);
    }
    expect(controller.calibration.state.stage).toBe("pinch");
  });

  it("calibrates lower, curved-finger neutral poses and preserves neutral positions and independent movement", () => {
    const controller = new HandControlsController({}, true);
    const left = { x: 0.65, y: 0.8, ratio: 0.4, rotation: plainQuat(posture("Left")) };
    const right = { x: 0.35, y: 0.83, ratio: 0.45, rotation: plainQuat(posture("Right")) };
    let t = calibrateControls(controller, 0, left, right);
    expect(controller.calibration.state.stage).toBe("ready");
    for (let i = 0; i < 60; i++) { t += 40; controller.update(controlFrame(t, left, right), t, cameraSize); }
    expect(controller.calibration.profile!.left.neutralCenter.y).toBeCloseTo(0.8);
    expect(controller.calibration.profile!.right.neutralCenter.y).toBeCloseTo(0.83);
    expect(controller.snapshot.left.target!.position).toEqual({ x: expect.closeTo(-0.5, 6), y: expect.closeTo(0, 6), z: expect.closeTo(0, 6) });
    expect(controller.snapshot.right.target!.position).toEqual({ x: expect.closeTo(0.5, 6), y: expect.closeTo(0, 6), z: expect.closeTo(0, 6) });
    expect(quaternion(controller.snapshot.left.target!.rotation).angleTo(new Quaternion())).toBeLessThan(1e-7);
    for (let i = 0; i < 60; i++) { t += 40; controller.update(controlFrame(t, { ...left, x: left.x - 0.03, y: left.y - 0.03 }, right), t, cameraSize); }
    expect(controller.snapshot.left.target!.position.x).toBeGreaterThan(-0.5);
    expect(controller.snapshot.left.target!.position.y).toBeGreaterThan(0);
    expect(quaternion(controller.snapshot.left.target!.rotation).angleTo(new Quaternion())).toBeLessThan(1e-7);
    expect(controller.snapshot.right.target!.position).toEqual({ x: expect.closeTo(0.5, 6), y: expect.closeTo(0, 6), z: expect.closeTo(0, 6) });
  });

  it("quick start waits for stable neutral, captures lower position, and never enables an uncaptured second hand", () => {
    const controller = new HandControlsController({}, true);
    controller.quickCalibrate(cameraSize);
    const left = { x: 0.6, y: 0.84, rotation: plainQuat(posture("Left")) };
    const tick = (i: number) => controller.update({ ...controlFrame(i * 40, left), right: null }, i * 40, cameraSize);
    for (let i = 1; i <= 31; i++) tick(i);
    expect(controller.snapshot.canProgress).toBe(false);
    expect(controller.snapshot.left.target).toBeNull();
    tick(32);
    expect(controller.snapshot.canProgress).toBe(true);
    expect(controller.snapshot.left.target!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(controller.calibration.profile!.left.neutralCenter.y).toBeCloseTo(0.84);
    controller.setSingleHand(false);
    expect(controller.snapshot.canProgress).toBe(false);
    expect(controller.snapshot.right.target).toBeNull();
  });

  it("retains the legacy guided/quick fallback when the surgical flag is disabled", () => {
    const controller = new HandControlsController({}, false);
    expect(calibrateControls(controller)).toBeGreaterThan(0);
    expect(controller.calibration.state.stage).toBe("ready");
    controller.quickCalibrate(cameraSize);
    for (let i = 1; i <= 8; i++) controller.update(controlFrame(i * 40, { y: 0.8 }), i * 40, cameraSize);
    expect(controller.snapshot.canProgress).toBe(true);
    expect(controller.calibration.profile!.left.neutralCenter.y).toBe(0.52);
  });
});
