import { describe, expect, it } from "vitest";
import { Quaternion } from "three";
import { HandControlsController } from "@/lib/vision/hand-controls";
import { quaternion, SURGICAL_ROTATION_LIMITS } from "@/lib/vision/hand-geometry";
import { handFrameSchema } from "@/types";
import { calibrateControls, cameraSize, controlFrame, type HandOptions } from "../fixtures/hand-controls";

function ready() {
  const controller = new HandControlsController();
  let time = calibrateControls(controller);
  expect(controller.calibration.state.stage).toBe("ready");
  const tick = (left: HandOptions = {}, right: HandOptions = {}) => {
    time += 40; controller.update(controlFrame(time, left, right), time, cameraSize);
    return controller.snapshot;
  };
  for (let i = 0; i < 20; i++) tick();
  return { controller, tick, now: () => time };
}

it("quick start captures each visible open hand's neutral wrist instead of clamping it at 90 degrees", () => {
  for (const side of ["left", "right"] as const) {
    const controller = new HandControlsController();
    controller.quickCalibrate(cameraSize);
    for (let index = 1; index <= 40; index++) {
      const frame = controlFrame(index * 40, { rotationZ: 0.3 }, { rotationZ: -0.2 });
      frame[side === "left" ? "right" : "left"] = null;
      controller.update(frame, index * 40, cameraSize);
    }
    const control = controller.snapshot[side];
    expect(controller.snapshot.canProgress).toBe(true);
    expect(control.target?.rotation.w).toBeCloseTo(1, 6);
    expect(control.rotationHeld).toBe(false);
  }
});

describe("guided calibration", () => {
  it("captures independent hand profiles and outputs schema-valid calibrated hands", () => {
    const { controller } = ready();
    const profile = controller.calibration.profile!;
    expect(profile.left.openPinchRatio).toBeCloseTo(0.9);
    expect(profile.left.closedPinchRatio).toBeCloseTo(0.1);
    expect(profile.right.closedPinchRatio).toBeCloseTo(0.15);
    expect(profile.left.enterPinchRatio).toBeLessThan(profile.left.releasePinchRatio);
    expect(profile.dimensions).toEqual(cameraSize);
    expect(controller.snapshot.canProgress).toBe(true);
    expect(handFrameSchema.safeParse(controller.snapshot.left.hand).success).toBe(true);
    expect(controller.snapshot.left.hand!.palmCenter.x).toBe(0.7);
  });
  it("does not calibrate from duplicates, missing hands, unstable poses or ambiguous labels", () => {
    const controller = new HandControlsController();
    controller.beginCalibration(0, cameraSize);
    for (let t = 40; t < 800; t += 40) controller.update(controlFrame(t), t, cameraSize);
    for (let t = 800; t < 1200; t += 40) controller.update(controlFrame(760), t, cameraSize);
    expect(controller.calibration.state.stage).toBe("neutral");
    controller.update({ ...controlFrame(1200), right: null }, 1200, cameraSize);
    for (let t = 1240; t < 2000; t += 40) controller.update(controlFrame(t, { x: t % 80 ? 0.7 : 0.8 }), t, cameraSize);
    expect(controller.calibration.state.stage).toBe("neutral");
    for (let t = 2000; t < 3000; t += 40) controller.update(controlFrame(t, { confidence: 0.4 }), t, cameraSize);
    expect(controller.calibration.profile).toBeNull();
  });
  it("requires distinct open/closed poses and a nonzero workspace", () => {
    const controller = new HandControlsController();
    controller.beginCalibration(0, cameraSize);
    for (let t = 40; t <= 1400; t += 40) controller.update(controlFrame(t), t, cameraSize);
    expect(controller.calibration.state.stage).toBe("pinch");
    for (let t = 1040; t <= 2000; t += 40) controller.update(controlFrame(t, { ratio: 0.8 }, { ratio: 0.8 }), t, cameraSize);
    expect(controller.calibration.state.stage).toBe("pinch");
    for (let t = 2040; t <= 3000; t += 40) controller.update(controlFrame(t, { ratio: 0.1 }, { ratio: 0.1 }), t, cameraSize);
    for (let t = 3040; t <= 5000; t += 40) controller.update(controlFrame(t), t, cameraSize);
    expect(controller.calibration.state.stage).toBe("workspace");
    expect(controller.calibration.profile).toBeNull();
  });
  it("times out in foreground, excludes suspension time, and supports retry/cancel", () => {
    const controller = new HandControlsController();
    controller.beginCalibration(0, cameraSize);
    controller.update(controlFrame(40), 40, cameraSize);
    controller.suspend(50);
    controller.update(controlFrame(50_000), 50_000, cameraSize);
    expect(controller.calibration.state.stage).toBe("neutral");
    controller.update(controlFrame(65_001), 65_001, cameraSize);
    expect(controller.calibration.state.stage).toBe("error");
    calibrateControls(controller, 66_000);
    expect(controller.calibration.state.stage).toBe("ready");
    controller.reset("Cancelled");
    expect(controller.calibration.profile).toBeNull();
    expect(controller.snapshot.left.target).toBeNull();
    expect(controller.calibration.state.message).toBe("Cancelled");
  });
});

describe("guided workspace recovery", () => {
  function workspace() {
    const controller = new HandControlsController();
    let time = 0;
    controller.beginCalibration(time, cameraSize);
    const tick = (left: HandOptions | null = {}, right: HandOptions | null = {}) => {
      time += 40;
      const frame = controlFrame(time, left ?? {}, right ?? {});
      if (!left) frame.left = null;
      if (!right) frame.right = null;
      controller.update(frame, time, cameraSize);
    };
    for (let i = 0; i < 32; i++) tick();
    for (let i = 0; i < 22; i++) tick({ ratio: 0.1 }, { ratio: 0.1 });
    expect(controller.calibration.state.stage).toBe("workspace");
    const hold = (left: HandOptions | null, right: HandOptions | null = {}) => { for (let i = 0; i < 6; i++) tick(left, right); };
    return { controller, tick, hold, now: () => time };
  }

  it("preserves confirmed directions through missing frames and captures the other hand independently", () => {
    const { controller, tick, hold } = workspace();
    hold({ x: 0.76 });
    expect(controller.calibration.state.workspace!.left.left).toBe(1);
    expect(controller.calibration.state.workspace!.left.right).toBe(0);
    hold(null, { x: 0.36 });
    expect(controller.calibration.state.workspace!.left.left).toBe(1);
    expect(controller.calibration.state.workspace!.right.left).toBe(1);
    expect(controller.calibration.state.message).toMatch(/left hand visible/);
    tick({ x: 0.64 }); tick({ x: 0.64 }); // a partial new direction
    expect(controller.calibration.state.workspace!.left.right).toBeGreaterThan(0);
    tick(null);
    expect(controller.calibration.state.workspace!.left.right).toBe(0);
    expect(controller.calibration.profile).toBeNull();
    hold({ x: 0.64 }); hold({ y: 0.44 }); hold({ y: 0.56 });
    hold({}, { x: 0.24 }); hold({}, { y: 0.44 }); hold({}, { y: 0.56 });
    expect(controller.calibration.state.stage).toBe("ready");
    expect(controller.calibration.profile!.left.range.left).toBeGreaterThan(0.035);
  });

  it("does not credit a one-frame spike, closed hand or weak identity; suspension keeps completed arrows", () => {
    const { controller, tick, hold, now } = workspace();
    tick({ x: 0.76 }); tick();
    expect(controller.calibration.state.workspace!.left.left).toBe(0);
    hold({ x: 0.76, ratio: 0.1 });
    expect(controller.calibration.state.message).toMatch(/Open your left hand/);
    expect(controller.calibration.state.workspace!.left.left).toBe(0);
    hold({ x: 0.76, confidence: 0.4 });
    expect(controller.calibration.state.workspace!.left.left).toBe(0);
    hold({ x: 0.76 });
    controller.suspend(now()); tick();
    expect(controller.calibration.state.workspace!.left.left).toBe(1);
    expect(controller.calibration.state.message).toMatch(/left hand right/);
  });

  it("allows 45 seconds, and retries workspace without repeating open/pinch calibration or losing confirmed arrows", () => {
    const { controller, hold, now } = workspace();
    hold({ x: 0.76 });
    controller.update(controlFrame(now() + 16_000), now() + 16_000, cameraSize);
    expect(controller.calibration.state.stage).toBe("workspace");
    controller.update(controlFrame(now() + 46_000), now() + 46_000, cameraSize);
    expect(controller.calibration.state.stage).toBe("error");
    expect(controller.calibration.state.retryStage).toBe("workspace");
    controller.beginCalibration(now() + 46_040, cameraSize);
    expect(controller.calibration.state.stage).toBe("workspace");
    expect(controller.calibration.state.workspace!.left.left).toBe(1);
    expect(controller.calibration.state.secondsRemaining).toBe(45);
    controller.reset();
    expect(controller.calibration.state.workspace).toBeUndefined();
    expect(controller.calibration.profile).toBeNull();
  });
});

describe("canonical hand control targets", () => {
  it.each([20, 30])("keeps position and rotation filter phase lag below 70 ms at %i tracking FPS", fps => {
    const controller = new HandControlsController();
    const start = calibrateControls(controller);
    const calibration = controller.calibration.profile!.left;
    const omega = Math.PI; // deliberate 0.5 Hz motion; warm up, then measure four cycles
    let positionSin = 0, positionCos = 0, rotationSin = 0, rotationCos = 0;
    for (let frame = 1; frame <= fps * 12; frame++) {
      const seconds = frame / fps, tMs = start + seconds * 1000;
      const sine = Math.sin(omega * seconds), cosine = Math.cos(omega * seconds);
      const sceneX = 0.2 * sine;
      const range = sceneX < 0 ? calibration.range.left : calibration.range.right;
      const imageX = calibration.neutralCenter.x - sceneX / 0.75 * range / (cameraSize.width / cameraSize.height);
      const raw = controlFrame(tMs, { x: imageX, rotationZ: 0.25 * sine });
      controller.update(raw, tMs, cameraSize);
      if (seconds <= 4) continue;
      const target = controller.snapshot.left.target!;
      const position = target.position.x + 0.5;
      const rotation = -2 * Math.atan2(target.rotation.z, target.rotation.w);
      positionSin += position * sine; positionCos += position * cosine;
      rotationSin += rotation * sine; rotationCos += rotation * cosine;
    }
    const positionLagMs = Math.atan2(-positionCos, positionSin) / omega * 1000;
    const rotationLagMs = Math.atan2(-rotationCos, rotationSin) / omega * 1000;
    // A frozen/zero target must not pass just because atan2(0, 0) reports zero lag.
    const measuredSamples = fps * 8;
    expect(Math.hypot(positionSin, positionCos) / (measuredSamples * 0.2 / 2)).toBeGreaterThan(0.85);
    expect(Math.hypot(rotationSin, rotationCos) / (measuredSamples * 0.25 / 2)).toBeGreaterThan(0.85);
    expect(positionLagMs).toBeGreaterThanOrEqual(0);
    expect(positionLagMs).toBeLessThan(70);
    expect(rotationLagMs).toBeGreaterThanOrEqual(0);
    expect(rotationLagMs).toBeLessThan(70);
  });

  it("still suppresses stationary position and rotation jitter with responsive controls", () => {
    const controller = new HandControlsController();
    const start = calibrateControls(controller);
    const calibration = controller.calibration.profile!.left;
    let positionEnergy = 0, rotationEnergy = 0, measured = 0;
    for (let frame = 1; frame <= 180; frame++) {
      const tMs = start + frame * (1000 / 30), noise = frame % 2 ? 0.01 : -0.01;
      const range = noise < 0 ? calibration.range.left : calibration.range.right;
      const x = calibration.neutralCenter.x - noise / 0.75 * range / (cameraSize.width / cameraSize.height);
      controller.update(controlFrame(tMs, { x, rotationZ: noise }), tMs, cameraSize);
      if (frame <= 60) continue;
      const target = controller.snapshot.left.target!;
      positionEnergy += (target.position.x + 0.5) ** 2;
      rotationEnergy += (2 * Math.atan2(target.rotation.z, target.rotation.w)) ** 2;
      measured++;
    }
    expect(Math.sqrt(positionEnergy / measured)).toBeLessThan(0.0045);
    expect(Math.sqrt(rotationEnergy / measured)).toBeLessThan(0.0045);
  });

  it("maps physical right/up and apparent approach positively, with clamped workspace and planar fallback", () => {
    const { controller, tick } = ready();
    for (let i = 0; i < 100; i++) tick({ x: 0.6, y: 0.4, scale: 2 });
    const target = controller.snapshot.left.target!;
    expect(target.position.x).toBeCloseTo(0.25);
    expect(target.position.y).toBeCloseTo(0.75);
    expect(target.position.z).toBeCloseTo(0.15);
    expect(controller.snapshot.right.target!.position.x).toBeCloseTo(0.5, 2);
    controller.setPlanar(true); tick({ scale: 2 });
    expect(controller.snapshot.left.target!.position.z).toBe(0);
    expect(() => new HandControlsController({ xyTravel: NaN })).toThrow();
  });
  it("holds grip through brief loss, pauses immediately, and resumes on the next valid frame without an automatic release", () => {
    const { controller, tick, now } = ready();
    for (let i = 0; i < 6; i++) tick({ ratio: 0.1 });
    expect(controller.snapshot.left.target!.jawClosed).toBe(true);
    const held = controller.snapshot.left.target;
    controller.update({ ...controlFrame(now() + 1), left: null }, now() + 1, cameraSize);
    expect(controller.snapshot.left.status).toBe("grace");
    expect(controller.snapshot.left.hand).toBeNull();
    expect(controller.snapshot.left.target).toBe(held);
    expect(controller.snapshot.canProgress).toBe(false);
    tick();
    expect(controller.snapshot.canProgress).toBe(true);
    expect(controller.snapshot.left.target!.jawClosed).toBe(true);
    tick(); tick(); tick();
    expect(controller.snapshot.left.target!.jawClosed).toBe(false);
    expect(controller.snapshot.right.target!.jawClosed).toBe(false);
  });
  it("keeps moving at variable inference cadence within freshness instead of repeatedly restarting recovery", () => {
    const { controller, now } = ready();
    let time = now();
    for (let i = 0; i < 12; i++) {
      time += i % 2 ? 150 : 170;
      controller.update(controlFrame(time, { x: 0.67 }), time, cameraSize);
      expect(controller.snapshot.left.status).toBe("tracking");
      expect(controller.snapshot.canProgress).toBe(true);
    }
    expect(controller.snapshot.left.target!.position.x).toBeGreaterThan(-0.5);
  });
  it("still requires three fresh frames after prolonged loss", () => {
    const { controller, now } = ready();
    let time = now() + 240;
    controller.update({ ...controlFrame(time), left: null }, time, cameraSize);
    expect(controller.snapshot.left.status).toBe("lost");
    for (let i = 0; i < 3; i++) {
      time += 40;
      controller.update(controlFrame(time), time, cameraSize);
      expect(controller.snapshot.canProgress).toBe(i === 2);
    }
  });
  it("expires frozen video, ignores invalid/reordered input, and does not refresh a held pose", () => {
    const { controller, now } = ready();
    const raw = controlFrame(now());
    controller.update({ ...raw, tMs: Infinity }, now() + 20, cameraSize);
    controller.update({ ...raw, tMs: now() + 1000 }, now() + 40, cameraSize);
    controller.update({ ...raw, tMs: now() - 100 }, now() + 60, cameraSize);
    expect(controller.snapshot.sourceTMs).toBe(now());
    controller.update(raw, now() + 201, cameraSize);
    expect(controller.snapshot.left.status).toBe("lost");
    expect(controller.snapshot.left.hand).toBeNull();
    expect(controller.snapshot.left.target).not.toBeNull();
    expect(controller.snapshot.canProgress).toBe(false);
  });
  it("retains calibration over suspension, clears recovery evidence and invalidates a changed camera format", () => {
    const { controller, tick, now } = ready();
    const profile = controller.calibration.profile;
    controller.suspend(now());
    expect(controller.snapshot.canProgress).toBe(false);
    expect(controller.calibration.state.progress).toBe(1);
    tick(); tick(); expect(controller.snapshot.canProgress).toBe(false);
    tick(); expect(controller.snapshot.canProgress).toBe(true);
    expect(controller.calibration.profile).toBe(profile);
    controller.update(controlFrame(now() + 40), now() + 40, { width: 640, height: 480 });
    expect(controller.calibration.profile).toBeNull();
    expect(controller.calibration.state.message).toMatch(/format changed/);
  });
  it("rejects malformed palms and does not let raw classification confidence masquerade as geometric accuracy", () => {
    const { controller, tick, now } = ready();
    const lowConfidence = tick({ confidence: 0.4 });
    expect(lowConfidence.left.hand!.confidence).toBe(0.4);
    expect(lowConfidence.left.rotationHeld).toBe(true);
    expect(lowConfidence.canProgress).toBe(false);
    const malformed = controlFrame(now() + 40);
    malformed.left!.worldLandmarks[9] = { ...malformed.left!.worldLandmarks[0] };
    controller.update(malformed, now() + 40, cameraSize);
    expect(controller.snapshot.left.hand).toBeNull();
    expect(controller.snapshot.right.status).toBe("tracking");
  });
  it("rejects single-frame orientation flips, accepts stable new poses, and never exceeds its rotation limit", () => {
    const { controller, tick } = ready();
    tick({ rotationZ: Math.PI * 0.8 });
    expect(controller.snapshot.left.rotationHeld).toBe(true);
    expect(new Quaternion().angleTo(quaternion(controller.snapshot.left.target!.rotation))).toBeLessThan(0.01);
    for (let i = 0; i < 100; i++) tick({ rotationZ: Math.PI * 0.8 });
    const rotation = quaternion(controller.snapshot.left.target!.rotation);
    expect(rotation.length()).toBeCloseTo(1);
    expect(new Quaternion().angleTo(rotation)).toBeCloseTo(SURGICAL_ROTATION_LIMITS.yaw, 3);
    expect(controller.snapshot.left.rotationHeld).toBe(false);
  });
  it("keeps hand identities through normal crossing without assigning by screen side", () => {
    const { controller, tick } = ready();
    for (let i = 0; i <= 40; i++) tick({ x: 0.7 - i * 0.01 }, { x: 0.3 + i * 0.01 });
    expect(controller.snapshot.left.hand!.handedness).toBe("Left");
    expect(controller.snapshot.right.hand!.handedness).toBe("Right");
    expect(controller.snapshot.left.target!.id).toBe("left-tool");
    expect(controller.snapshot.right.target!.id).toBe("right-tool");
  });
});
