import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { ASSISTED_GRAB_RADIUS, composePose, GRAB_RADIUS, interpolatePose, pickupFeedback, relativePose, TIP_OFFSET, toolFromTarget, ToolSimulationController, type Pose } from "@/lib/simulation/tool-simulation";
import { emptyControlSnapshot, type ControlSnapshot, type ToolControlTarget } from "@/lib/vision/control-types";
import { toolStateSchema } from "@/types";
import { identityQuat, makeHandFrame } from "../fixtures/contracts";

const target = (side: "left" | "right", x = 0, closed = false): ToolControlTarget => ({ id: side === "left" ? "left-tool" : "right-tool", position: { x, y: 0, z: 0 }, rotation: { ...identityQuat }, jawClosed: closed });
function controls(time: number, left = target("left"), right = target("right", 0.5)): ControlSnapshot {
  return { sourceTMs: time, calibrated: true, canProgress: true,
    left: { status: "tracking", lastSeenMs: time, hand: makeHandFrame("Left"), target: left, rotationHeld: false },
    right: { status: "tracking", lastSeenMs: time, hand: makeHandFrame("Right"), target: right, rotationHeld: false } };
}
function ready() { const controller = new ToolSimulationController({ assisted: false }); controller.update(controls(0), 0); return controller; }
function held() { const controller = ready(); expect(controller.update(controls(40, target("left", 0, true)), 40)).toHaveLength(1); return controller; }

describe("simulation geometry", () => {
  it("uses rotated geometry tips, normalizes quaternions, and matches shared ToolState", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    const tool = toolFromTarget({ ...target("left", 1), rotation: { x: q.x * 2, y: q.y * 2, z: q.z * 2, w: q.w * 2 } }, "left-tool")!;
    expect(tool.tipPosition.x).toBeCloseTo(1 - TIP_OFFSET.y); expect(tool.tipPosition.y).toBeCloseTo(0);
    expect(toolStateSchema.safeParse(tool).success).toBe(true);
    const inverseSign = toolFromTarget({ ...target("left", 1), rotation: { x: -q.x, y: -q.y, z: -q.z, w: -q.w } }, "left-tool")!;
    expect(inverseSign.tipPosition.x).toBeCloseTo(tool.tipPosition.x);
  });
  it("rejects mismatched identity, nonfinite points and zero/overflowing rotations", () => {
    expect(toolFromTarget(target("right"), "left-tool")).toBeNull();
    for (const value of [NaN, Infinity, -Infinity]) expect(toolFromTarget({ ...target("left"), position: { x: value, y: 0, z: 0 } }, "left-tool")).toBeNull();
    for (const value of [0, NaN, Infinity, 1e308]) expect(toolFromTarget({ ...target("left"), rotation: { x: value, y: 0, z: 0, w: 0 } }, "left-tool")).toBeNull();
    const missing = target("left"); delete (missing.rotation as Partial<typeof missing.rotation>).w;
    expect(toolFromTarget(missing, "left-tool")).toBeNull();
  });
  it("preserves world pose through nontrivial attachment and transforms offsets with the owner", () => {
    const parent: Pose = { position: { x: 1, y: -1, z: 2 }, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } };
    const child: Pose = { position: { x: 1.2, y: 0.4, z: 1 }, rotation: { ...identityQuat } };
    const reconstructed = composePose(parent, relativePose(parent, child));
    for (const axis of ["x", "y", "z"] as const) expect(reconstructed.position[axis]).toBeCloseTo(child.position[axis]);
    expect(Math.abs(reconstructed.rotation.w)).toBeCloseTo(1);
  });
});

describe("deterministic acquisition and release", () => {
  it("starts closed without grabbing, requires an edge, and consumes each sample once", () => {
    const c = new ToolSimulationController();
    expect(c.update(controls(0, target("left", 0, true)), 0)).toEqual([]);
    c.update(controls(40), 40);
    const close = controls(80, target("left", 0, true)); const input = structuredClone(close);
    expect(c.update(close, 80)).toEqual([{ kind: "grab", sourceTMs: 80, toolId: "left-tool", objectId: "practice-needle" }]);
    expect(c.update(close, 90)).toEqual([]); expect(close).toEqual(input);
    expect(c.snapshot.left?.heldObjectId).toBe("practice-needle");
  });
  it.each([GRAB_RADIUS, -GRAB_RADIUS])("includes the radius boundary at %s", x => {
    const c = ready(); expect(c.update(controls(40, target("left", x, true)), 40)[0]?.kind).toBe("grab");
  });
  it("rejects outside-radius closure and entering while already closed", () => {
    const c = ready(); expect(c.update(controls(40, target("left", GRAB_RADIUS + 1e-6, true)), 40)).toEqual([]);
    expect(c.update(controls(80, target("left", 0, true)), 80)).toEqual([]);
    c.update(controls(120), 120); expect(c.update(controls(160, target("left", 0, true)), 160)[0]?.kind).toBe("grab");
  });
  it("arbitrates by distance then identity, never granting two owners", () => {
    for (const [leftX, rightX, owner] of [[0.08, 0.02, "right-tool"], [0.02, 0.02, "left-tool"]] as const) {
      const c = ready(); const events = c.update(controls(40, target("left", leftX, true), target("right", rightX, true)), 40);
      expect(events).toHaveLength(1); expect(c.snapshot.object.heldBy).toBe(owner);
      expect([c.snapshot.left, c.snapshot.right].filter(tool => tool?.heldObjectId)).toHaveLength(1);
    }
  });
  it("follows ownership, releases without gravity, and excludes same-sample handoff", () => {
    const c = held();
    c.update(controls(80, target("left", 0.3, true)), 80); expect(c.snapshot.object.position.x).toBeCloseTo(0.3);
    const release = c.update(controls(120, target("left", 0.3), target("right", 0.3, true)), 120);
    expect(release.map(event => event.kind)).toEqual(["release"]); expect(c.snapshot.object.heldBy).toBeNull();
    expect(c.snapshot.left?.heldObjectId).toBeUndefined();
    c.update(controls(160, target("left", -0.5), target("right", 0.3, true)), 160);
    expect(c.snapshot.object.position).toEqual({ x: 0.3, y: 0.35, z: 0 }); expect(c.snapshot.object.heldBy).toBeNull();
  });
});

describe("easy pickup and actionable feedback", () => {
  it("locks actual tips to the working plane despite depth/tilt, then snaps into the jaws", () => {
    const c = new ToolSimulationController();
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4);
    const pose = { ...target("left", 0.12), position: { x: 0.12, y: 0, z: 0.15 }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
    const input = controls(0, pose), before = structuredClone(input);
    c.update(input, 0);
    expect(c.snapshot.left!.tipPosition.z).toBeCloseTo(0); expect(input).toEqual(before);
    expect(pickupFeedback(c.snapshot).ready).toBe(true);
    expect(c.update(controls(40, { ...pose, jawClosed: true }), 40)[0]?.kind).toBe("grab");
    expect(c.snapshot.object.position).toEqual(c.snapshot.left!.tipPosition);
    c.update(controls(80, { ...pose, jawClosed: true, rotation: { ...identityQuat } }), 80);
    expect(c.snapshot.object.position.z).toBeCloseTo(0);
    expect(pickupFeedback(c.snapshot).message).toContain("Open your thumb");
  });
  it.each([ASSISTED_GRAB_RADIUS, -ASSISTED_GRAB_RADIUS])("matches the visible assisted radius at %s", x => {
    const c = new ToolSimulationController(); c.update(controls(0, target("left", x)), 0);
    expect(pickupFeedback(c.snapshot).ready).toBe(true);
    expect(c.update(controls(40, target("left", x, true)), 40)).toHaveLength(1);
    expect(c.snapshot.object.position.x).toBe(x);
  });
  it("keeps strict 3D depth available and resets ownership when assistance changes", () => {
    const c = new ToolSimulationController({ assisted: false });
    const far = { ...target("left"), position: { x: 0, y: 0, z: 0.15 } };
    c.update(controls(0, far), 0); expect(pickupFeedback(c.snapshot).ready).toBe(false);
    expect(pickupFeedback(c.snapshot).message).toContain("farther from");
    expect(c.update(controls(40, { ...far, jawClosed: true }), 40)).toEqual([]);
    c.setAssisted(true); c.update(controls(80, far), 80);
    expect(c.update(controls(120, { ...far, jawClosed: true }), 120)).toHaveLength(1);
    c.setAssisted(false); expect(c.snapshot.object.heldBy).toBeNull(); expect(c.snapshot.assisted).toBe(false);
    c.update(controls(160, { ...far, jawClosed: true }), 160); expect(c.snapshot.object.heldBy).toBeNull();
  });
  it("instructs reopening after a missed pinch and never reports ready during suspension", () => {
    const c = new ToolSimulationController(); c.update(controls(0, target("left", 0.3)), 0);
    c.update(controls(40, target("left", 0.3, true)), 40);
    c.update(controls(80, target("left", 0, true)), 80);
    expect(pickupFeedback(c.snapshot).message).toContain("Open your thumb");
    expect(pickupFeedback(c.snapshot).ready).toBe(false);
    c.update(controls(120), 120); expect(pickupFeedback(c.snapshot).ready).toBe(true);
    c.suspend(); expect(pickupFeedback(c.snapshot).ready).toBe(false);
  });
  it("offers a ready open tool even when the nearer tool is closed", () => {
    const c = new ToolSimulationController(); c.update(controls(0, target("left", 0, true), target("right", 0.08)), 0);
    expect(pickupFeedback(c.snapshot).message).toContain("Right tip aligned");
  });
});

describe("freshness and lifecycle", () => {
  it.each(["missing", "recovering", "rotation", "gate", "stale"])("freezes both instruments and grip on %s", reason => {
    const c = held(), before = structuredClone(c.snapshot);
    const sample = controls(80, target("left", 1), target("right", 1));
    if (reason === "missing") sample.right.hand = null;
    if (reason === "recovering") sample.right.status = "recovering";
    if (reason === "rotation") sample.right.rotationHeld = true;
    if (reason === "gate") sample.canProgress = false;
    c.update(sample, reason === "stale" ? 280 : 80);
    expect(c.snapshot.canProgress).toBe(false); expect(c.snapshot.left).toEqual(before.left); expect(c.snapshot.right).toEqual(before.right); expect(c.snapshot.object).toEqual(before.object);
    // Opening on a new eligible observation releases, without treating loss as release.
    expect(c.update(controls(320), 320).map(event => event.kind)).toEqual(["release"]);
  });
  it("does not queue grabs across suspension or an unobserved source gap", () => {
    for (const suspended of [false, true]) {
      const c = ready(); if (suspended) c.suspend();
      expect(c.update(controls(200, target("left", 0, true)), 200)).toEqual([]); expect(c.snapshot.object.heldBy).toBeNull();
    }
  });
  it("rejects future, reordered, nonfinite and malformed samples without corrupting state", () => {
    const c = held();
    for (const [source, now] of [[NaN, 80], [Infinity, 80], [1000, 80], [0, 80], [80, NaN]]) {
      expect(c.update(controls(source), now)).toEqual([]); expect(c.snapshot.object.heldBy).toBe("left-tool");
    }
    const broken = controls(80); broken.left.target!.rotation.w = 0;
    expect(c.update(broken, 80)).toEqual([]); expect(c.snapshot.object.heldBy).toBe("left-tool");
    expect(c.update(controls(120), 120)[0]?.kind).toBe("release");
  });
  it("honors suspension on duplicate sources and resumes only with a fresh source", () => {
    const c = ready(); const sample = controls(0); sample.canProgress = false; c.update(sample, 10);
    expect(c.snapshot.canProgress).toBe(false);
    sample.canProgress = true; c.update(sample, 20); expect(c.snapshot.canProgress).toBe(false);
    c.update(controls(40), 40); expect(c.snapshot.canProgress).toBe(true);
  });
  it("rejects inconsistent hand slots and invalid geometry even on duplicate timestamps", () => {
    const c = held(), previous = structuredClone(c.snapshot.left);
    const duplicate = controls(40); duplicate.left.target = null;
    expect(c.update(duplicate, 50)).toEqual([]); expect(c.snapshot.canProgress).toBe(false);
    expect(c.snapshot.left).toEqual(previous); expect(c.snapshot.object.heldBy).toBe("left-tool");
    const mismatched = controls(80); mismatched.left.hand!.handedness = "Right";
    expect(c.update(mismatched, 80)).toEqual([]); expect(c.snapshot.object.heldBy).toBe("left-tool");
    expect(c.update(controls(120), 120)[0]?.kind).toBe("release");
  });
  it("resets object and ownership without release events when calibration/session is invalidated", () => {
    const c = held(), epoch = c.epoch;
    expect(c.update(emptyControlSnapshot(), 80)).toEqual([]); expect(c.epoch).toBeGreaterThan(epoch);
    expect(c.snapshot.object.heldBy).toBeNull(); expect(c.snapshot.left).toBeNull();
    c.update(controls(120, target("left", 0, true)), 120); expect(c.snapshot.object.heldBy).toBeNull();
    c.reset(); expect(c.snapshot.sourceTMs).toBeNull(); expect(c.snapshot.object.position).toEqual({ x: 0, y: 0.35, z: 0 });
  });
});

describe("display-only interpolation", () => {
  const origin: Pose = { position: { x: 0, y: 0, z: 0 }, rotation: { ...identityQuat } };
  it("does not overshoot, takes the shortest quaternion path, and bounds invalid/long deltas", () => {
    const target: Pose = { position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: -1 } };
    const next = interpolatePose(origin, target, 1 / 60);
    expect(next.position.x).toBeGreaterThan(0); expect(next.position.x).toBeLessThan(1); expect(Math.abs(next.rotation.w)).toBeCloseTo(1);
    expect(interpolatePose(origin, target, 10)).toEqual(interpolatePose(origin, target, 0.05));
    for (const delta of [NaN, Infinity, -1, 0]) expect(interpolatePose(origin, target, delta).position).toEqual(origin.position);
    expect(origin.position.x).toBe(0);
  });
  it.each([[20, 60], [30, 60], [20, 120], [30, 120]])("adds less than 30ms phase delay at %i source / %i display FPS", (sourceFps, displayFps) => {
    let current = origin, sourceSin = 0, sourceCos = 0, displaySin = 0, displayCos = 0, sourceRotationSin = 0, sourceRotationCos = 0, displayRotationSin = 0, displayRotationCos = 0;
    for (let frame = 1; frame <= displayFps * 12; frame++) {
      const seconds = frame / displayFps, sourceTime = Math.floor(seconds * sourceFps + 1e-8) / sourceFps;
      const value = Math.sin(Math.PI * sourceTime), angle = 0.25 * value;
      current = interpolatePose(current, { position: { x: value, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) } }, 1 / displayFps);
      if (seconds <= 4) continue;
      const sin = Math.sin(Math.PI * seconds), cos = Math.cos(Math.PI * seconds);
      sourceSin += value * sin; sourceCos += value * cos; displaySin += current.position.x * sin; displayCos += current.position.x * cos;
      sourceRotationSin += angle * sin; sourceRotationCos += angle * cos;
      const outputAngle = 2 * Math.atan2(current.rotation.z, current.rotation.w);
      displayRotationSin += outputAngle * sin; displayRotationCos += outputAngle * cos;
    }
    const phase = (sin: number, cos: number) => Math.atan2(-cos, sin) / Math.PI * 1000;
    for (const delay of [phase(displaySin, displayCos) - phase(sourceSin, sourceCos), phase(displayRotationSin, displayRotationCos) - phase(sourceRotationSin, sourceRotationCos)]) {
      expect(delay).toBeGreaterThanOrEqual(0); expect(delay).toBeLessThan(30);
    }
    expect(Math.hypot(displaySin, displayCos) / Math.hypot(sourceSin, sourceCos)).toBeGreaterThan(0.95);
  });
});
