import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial } from "three";
import { ReplayController } from "@/lib/simulation/replay-controller";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "@/lib/exercise/ghost-reference";

const runtime = vi.hoisted(() => ({ lost: false, frames: new Set<(_: unknown, delta: number) => void>(), canvas: null as HTMLCanvasElement | null }));
vi.mock("@react-three/fiber", async () => {
  const React = await import("react");
  return { useThree: () => ({ gl: { domElement: runtime.canvas, getContext: () => ({ isContextLost: () => runtime.lost }) } }),
    useFrame: (callback: (_: unknown, delta: number) => void) => React.useEffect(() => {
      runtime.frames.add(callback); return () => { runtime.frames.delete(callback); };
    }, [callback]) };
});
import { ReplayLoop, updateReplayLayer } from "@/components/scene/replay-scene";

const makeReplay = () => new ReplayController({ skillId: "needle-passing", userFrames: DEFAULT_NEEDLE_PASSING_REFERENCE.frames,
  reference: DEFAULT_NEEDLE_PASSING_REFERENCE });

beforeEach(() => { runtime.lost = false; runtime.canvas = document.createElement("canvas"); runtime.frames.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.spyOn(document, "hidden", "get").mockReturnValue(false); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("A6 actual Three group updates", () => {
  it("matches visible tips/jaws and connector endpoints, hides references, and disposes replaced path geometry", () => {
    const replay = makeReplay(); const root = new Group();
    for (const actor of ["user", "reference"]) for (const side of ["left", "right"]) {
      const instrument = new Group(); instrument.name = `replay-${actor}-${side}`;
      for (const name of ["jaw-left", "jaw-right"]) { const jaw = new Group(); jaw.name = name; instrument.add(jaw); }
      const path = new Line(new BufferGeometry(), new LineBasicMaterial()); path.name = `replay-${actor}-${side}-path`;
      root.add(instrument, path);
    }
    for (const side of ["left", "right"]) {
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
      const line = new Line(geometry, new LineBasicMaterial()); line.name = `replay-${side}-deviation`; root.add(line);
    }
    const originalPath = root.getObjectByName("replay-user-left-path") as Line;
    const dispose = vi.spyOn(originalPath.geometry, "dispose");
    replay.seekProgress(0.4); updateReplayLayer(root, replay.snapshot, replay.getTrails());
    expect(dispose).toHaveBeenCalledOnce();
    const user = root.getObjectByName("replay-user-left")!;
    expect(user.position.x).toBe(replay.snapshot.user!.leftTool.position.x);
    expect(user.position.y).toBe(replay.snapshot.user!.leftTool.position.y);
    const connector = root.getObjectByName("replay-left-deviation") as Line;
    const endpoints = connector.geometry.getAttribute("position");
    expect(endpoints.getX(0)).toBeCloseTo(replay.snapshot.user!.leftTool.tipPosition.x, 6);
    expect(endpoints.getX(1)).toBeCloseTo(replay.snapshot.reference!.leftTool.tipPosition.x, 6);
    const geometry = originalPath.geometry;
    updateReplayLayer(root, replay.snapshot, replay.getTrails()); expect(originalPath.geometry).toBe(geometry);
    replay.setShowExpert(false); replay.setShowPaths(false); updateReplayLayer(root, replay.snapshot, replay.getTrails());
    expect(root.getObjectByName("replay-reference-left")!.visible).toBe(false);
    expect(connector.visible).toBe(false); expect(originalPath.visible).toBe(false);
    root.traverse(node => { if (node instanceof Line) { node.geometry.dispose(); (node.material as LineBasicMaterial).dispose(); } });
  });
});

describe("A6 replay lifecycle", () => {
  it("uses one frame subscription in Strict Mode, pauses on hidden/context loss, and preserves cursor on teardown", async () => {
    const controller = makeReplay(), onStatus = vi.fn(), onFrame = vi.fn();
    let renders = 0;
    function Harness() { renders++; return <ReplayLoop controller={controller} onStatus={onStatus} onFrame={onFrame} />; }
    const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
    await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
    const tick = (delta: number) => runtime.frames.forEach(callback => callback({}, delta));
    try {
      expect(runtime.frames.size).toBe(1); const count = renders;
      controller.play(); tick(5); expect(controller.snapshot.timeMs).toBe(0); // ignore stale initial delta
      tick(0.1); expect(controller.snapshot.timeMs).toBe(100);
      expect(renders).toBe(count);
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange")); tick(30);
      expect(controller.snapshot.timeMs).toBe(100); expect(controller.snapshot.playing).toBe(false);
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      document.dispatchEvent(new Event("visibilitychange")); tick(30); expect(controller.snapshot.timeMs).toBe(100);
      controller.play(); tick(0.1); expect(controller.snapshot.timeMs).toBe(200);
      const lost = new Event("webglcontextlost", { cancelable: true }); runtime.lost = true; runtime.canvas!.dispatchEvent(lost);
      expect(lost.defaultPrevented).toBe(true); tick(20);
      expect(onStatus).toHaveBeenLastCalledWith("lost"); expect(controller.snapshot.timeMs).toBe(200);
      runtime.lost = false; runtime.canvas!.dispatchEvent(new Event("webglcontextrestored")); tick(20);
      expect(onStatus).toHaveBeenLastCalledWith("ready"); expect(controller.snapshot.playing).toBe(false);
      controller.play(); tick(0.1); expect(controller.snapshot.timeMs).toBe(300);
    } finally { await act(async () => root.unmount()); container.remove(); }
    expect(runtime.frames.size).toBe(0); expect(controller.snapshot.timeMs).toBe(300); expect(controller.snapshot.playing).toBe(false);
    onStatus.mockClear(); runtime.canvas!.dispatchEvent(new Event("webglcontextrestored")); expect(onStatus).not.toHaveBeenCalled();
  });
});
