import { act, Activity, StrictMode, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { ExerciseController } from "@/lib/exercise/exercise-controller";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { emptyControlSnapshot, type ControlSnapshot } from "@/lib/vision/control-types";
import { makeHandFrame, identityQuat } from "../fixtures/contracts";
import type { SceneDiagnostics } from "@/components/scene/training-scene";

const runtime = vi.hoisted(() => ({ lost: false, frames: new Set<(_: unknown, delta: number) => void>(), three: {} as { gl: { domElement: HTMLCanvasElement; getContext: () => { isContextLost: () => boolean } }; camera: PerspectiveCamera; size: { width: number; height: number } } }));
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return {
    useThree: () => runtime.three,
    useFrame: (callback: (_: unknown, delta: number) => void) => React.useEffect(() => { runtime.frames.add(callback); return () => { runtime.frames.delete(callback); }; }, [callback]),
  };
});
vi.mock("@/components/scene/operating-room", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { Group } = await import("three");
  return { OperatingRoom: () => null, PracticeNeedle: forwardRef(function MockNeedle(_, ref) {
    useImperativeHandle(ref, () => new Group(), []); return null;
  }) };
});
vi.mock("@/components/scene/instrument", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { Group } = await import("three");
  return { Instrument: forwardRef(function MockInstrument(_, ref) {
    useImperativeHandle(ref, () => { const group = new Group(); group.visible = false; return group; }, []); return null;
  }) };
});
vi.mock("@/components/scene/pickup-guides", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { Group } = await import("three");
  const Guide = forwardRef(function Guide(_, ref) { useImperativeHandle(ref, () => new Group(), []); return null; });
  return { TipCursor: Guide, PickupHalo: Guide };
});
vi.mock("@/components/scene/exercise-targets", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/scene/exercise-targets")>();
  const { forwardRef, useImperativeHandle } = await import("react");
  const { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } = await import("three");
  return {
    ...actual,
    ExerciseTargets: forwardRef(function MockExerciseTargets(_, ref) {
      useImperativeHandle(ref, () => {
        const group = new Group();
        for (const name of ["ring-1", "ring-2", "ring-3", "tissue-wall"]) {
          const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
          mesh.name = name;
          group.add(mesh);
        }
        for (const name of ["corridor-guide", "release-zone"]) {
          const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
          mesh.name = name;
          group.add(mesh);
        }
        return group;
      }, []);
      return null;
    }),
  };
});
import { SceneContent } from "@/components/scene/training-scene";

// Preserve the real simulation/geometry implementation; selectively reject only
// the display projection to exercise a failure independent of input validation.
vi.mock("@/lib/simulation/tool-simulation", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/simulation/tool-simulation")>();
  return { ...actual, toolFromTarget: vi.fn(actual.toolFromTarget) };
});
import { toolFromTarget } from "@/lib/simulation/tool-simulation";

function sample(time: number): ControlSnapshot {
  const control = (side: "left" | "right") => ({ status: "tracking" as const, lastSeenMs: time, rotationHeld: false,
    hand: makeHandFrame(side === "left" ? "Left" : "Right"),
    target: { id: side === "left" ? "left-tool" as const : "right-tool" as const, position: { x: side === "left" ? 0 : 0.5, y: 0, z: 0 }, rotation: { ...identityQuat }, jawClosed: false } });
  return { sourceTMs: time, calibrated: true, canProgress: true, left: control("left"), right: control("right") };
}

describe("scene frame and lifecycle integration", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.lost = false;
    runtime.three = { gl: { domElement: document.createElement("canvas"), getContext: () => ({ isContextLost: () => runtime.lost }) }, camera: new PerspectiveCamera(), size: { width: 800, height: 420 } };
    runtime.frames.clear();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function harness(strict = false, exercise?: ExerciseController) {
    let now = 0, renders = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const controlsRef = { current: sample(0) }, diagnosticsRef = createRef<SceneDiagnostics | null>();
    const controller = new ToolSimulationController(), onStatus = vi.fn();
    const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
    function Harness() { renders++; return <SceneContent controlsRef={controlsRef} controller={controller} exercise={exercise} diagnosticsRef={diagnosticsRef} onStatus={onStatus} />; }
    const render = async (mode: "visible" | "hidden" = "visible") => act(async () => root.render(strict ? <StrictMode><Harness /></StrictMode> : <Activity mode={mode}><Harness /></Activity>));
    await render();
    const tick = (time: number, control = sample(time)) => { now = time; controlsRef.current = control; runtime.frames.forEach(callback => callback({}, 1 / 60)); };
    return { tick, render, controller, exercise, diagnosticsRef, onStatus, renders: () => renders,
      dispose: async () => { await act(async () => root.unmount()); container.remove(); } };
  }

  it("initializes actual display groups and updates refs without React frame rerenders under Strict Mode", async () => {
    const h = await harness(true);
    try {
      h.tick(0); expect(h.diagnosticsRef.current?.rendered.left?.position.x).toBe(0);
      const renders = h.renders();
      for (let frame = 1; frame <= 60; frame++) h.tick(frame * 16);
      expect(h.renders()).toBe(renders); expect(runtime.frames.size).toBe(1);
      expect(h.diagnosticsRef.current!.frames).toBe(61);
    } finally { await h.dispose(); }
    expect(runtime.frames.size).toBe(0); expect(h.diagnosticsRef.current).toBeNull();
    expect(h.controller.snapshot.left).toBeNull();
  });
  it("freezes both rendered transforms, resumes smoothly, and reinitializes after reset", async () => {
    const h = await harness();
    try {
      h.tick(0); const before = structuredClone(h.diagnosticsRef.current!.rendered);
      const missing = sample(40); missing.canProgress = false; missing.right.hand = null; missing.left.target!.position.x = 1;
      h.tick(40, missing); expect(h.diagnosticsRef.current!.rendered).toEqual(before);
      const recovered = sample(80); recovered.left.target!.position.x = 1;
      h.tick(80, recovered); expect(h.diagnosticsRef.current!.rendered.left!.position.x).toBe(0);
      h.tick(96, { ...recovered, sourceTMs: 96, left: { ...recovered.left, lastSeenMs: 96 }, right: { ...recovered.right, lastSeenMs: 96 } });
      expect(h.diagnosticsRef.current!.rendered.left!.position.x).toBeGreaterThan(0);
      h.controller.reset(); h.tick(120);
      expect(h.diagnosticsRef.current!.rendered.left!.position.x).toBe(0);
      h.tick(140, emptyControlSnapshot()); expect(h.diagnosticsRef.current!.rendered.left).toBeNull();
    } finally { await h.dispose(); }
  });
  it("keeps the last rendered pose when display projection rejects, then recovers", async () => {
    const h = await harness();
    try {
      h.tick(0); const before = structuredClone(h.diagnosticsRef.current!.rendered.left);
      vi.mocked(toolFromTarget).mockReturnValueOnce(null);
      const moved = sample(40); moved.left.target!.position.x = 1;
      expect(() => h.tick(40, moved)).not.toThrow();
      expect(h.diagnosticsRef.current!.rendered.left).toEqual(before);
      expect(h.diagnosticsRef.current!.snapshot.left!.position.x).toBe(1);
      const recovered = sample(80); recovered.left.target!.position.x = 1; h.tick(80, recovered);
      expect(h.diagnosticsRef.current!.rendered.left!.position.x).toBeGreaterThan(0);
      expect(h.diagnosticsRef.current!.frames).toBe(3);
    } finally { await h.dispose(); }
  });
  it("does not expose an uninitialized instrument if its first projection rejects", async () => {
    const h = await harness();
    try {
      vi.mocked(toolFromTarget).mockReturnValueOnce(null);
      const first = sample(0); first.left.target!.position.x = 1;
      expect(() => h.tick(0, first)).not.toThrow();
      expect(h.diagnosticsRef.current!.rendered.left).toBeNull();
      const recovered = sample(40); recovered.left.target!.position.x = 1; h.tick(40, recovered);
      expect(h.diagnosticsRef.current!.rendered.left!.position.x).toBe(1);
    } finally { await h.dispose(); }
  });
  it("holds an attached object's visual pose through freeze and keeps release continuous", async () => {
    const h = await harness();
    try {
      h.tick(0);
      const closed = sample(40); closed.left.target!.jawClosed = true; h.tick(40, closed);
      expect(h.controller.snapshot.object.heldBy).toBe("left-tool");
      const moving = sample(80); moving.left.target!.jawClosed = true; moving.left.target!.position.x = 0.5; h.tick(80, moving);
      const heldPose = structuredClone(h.diagnosticsRef.current!.rendered.object);
      expect(heldPose!.position.x).toBeCloseTo(h.diagnosticsRef.current!.rendered.left!.position.x);
      const missing = sample(100); missing.canProgress = false; h.tick(100, missing);
      expect(h.diagnosticsRef.current!.rendered.object).toEqual(heldPose);
      const open = sample(120); open.left.target!.position.x = 0.5; h.tick(120, open);
      expect(h.controller.snapshot.object.heldBy).toBeNull(); expect(h.diagnosticsRef.current!.rendered.object).toEqual(heldPose);
    } finally { await h.dispose(); }
  });
  it("handles visibility, context loss/restoration, Activity teardown, and listener cleanup", async () => {
    const h = await harness();
    try {
      h.tick(0);
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange")); expect(h.controller.snapshot.canProgress).toBe(false);
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      const event = new Event("webglcontextlost", { cancelable: true }); runtime.three.gl.domElement.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true); expect(h.onStatus).toHaveBeenLastCalledWith("lost");
      h.tick(40); expect(h.controller.snapshot.canProgress).toBe(false);
      runtime.three.gl.domElement.dispatchEvent(new Event("webglcontextrestored")); h.tick(80);
      expect(h.onStatus).toHaveBeenLastCalledWith("ready"); expect(h.controller.snapshot.canProgress).toBe(true);
      runtime.three.gl.domElement.dispatchEvent(new Event("webglcontextlost")); runtime.lost = true;
      await h.render("hidden"); expect(runtime.frames.size).toBe(0); expect(h.controller.snapshot.left).toBeNull();
      // Restoration can happen while Activity has removed our listeners.
      runtime.lost = false;
      await h.render("visible"); h.tick(120); expect(runtime.frames.size).toBe(1); expect(h.controller.snapshot.canProgress).toBe(true);
      runtime.three.gl.domElement.dispatchEvent(new Event("webglcontextlost")); runtime.lost = true;
      await h.render("hidden"); await h.render("visible"); h.tick(160);
      expect(h.controller.snapshot.canProgress).toBe(false); expect(h.onStatus).toHaveBeenLastCalledWith("lost");
      runtime.lost = false; runtime.three.gl.domElement.dispatchEvent(new Event("webglcontextrestored")); h.tick(200);
      expect(h.controller.snapshot.canProgress).toBe(true);
    } finally { await h.dispose(); }
    h.onStatus.mockClear(); runtime.three.gl.domElement.dispatchEvent(new Event("webglcontextlost"));
    expect(h.onStatus).not.toHaveBeenCalled(); expect(runtime.frames.size).toBe(0);
  });
  it("steps ExerciseController in useFrame, updates target visuals, and honors Assessment mode without React rerenders", async () => {
    const exercise = new ExerciseController({ mode: "assessment" });
    const h = await harness(false, exercise);
    try {
      const initialRenders = h.renders();
      h.tick(0);
      expect(h.diagnosticsRef.current?.exercise?.phase).toBe("active");
      expect(h.diagnosticsRef.current?.exercise?.segmentId).toBe("approach");
      expect(h.diagnosticsRef.current?.exercise?.modeHooks.ghostVisible).toBe(false);
      expect(h.diagnosticsRef.current?.exercise?.modeHooks.showPathGuide).toBe(false);
      const closed = sample(40); closed.left.target!.jawClosed = true;
      h.tick(40, closed);
      expect(h.diagnosticsRef.current?.exercise?.segmentId).toBe("grip");
      expect(h.renders()).toBe(initialRenders);
    } finally { await h.dispose(); }
    expect(exercise.snapshot.phase).toBe("idle");
  });
});
