import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NEEDLE_PASSING_REFERENCE, normalizeToolWithGripOffset } from "@/lib/exercise/ghost-reference";
import type { CompletedReplay } from "@/lib/simulation/replay-types";
import type { MotionFrame, ReferenceMotion, ReplayMarker } from "@/types";
import { AudioManager } from "@/lib/voice/audio-manager";

vi.mock("@/components/scene/replay-scene", async () => {
  const React = await import("react");
  function MockReplayScene({ controller, onStatus }: {
    controller: { update: (deltaSeconds: number) => void };
    onStatus: (status: "ready" | "lost") => void;
  }) {
    React.useEffect(() => {
      onStatus("ready");
      const id = window.setInterval(() => controller.update(0.05), 20);
      return () => window.clearInterval(id);
    }, [controller, onStatus]);
    return React.createElement("div", { "data-testid": "mock-replay-scene" });
  }
  return { default: MockReplayScene };
});

import { ThreeDReplayPreview } from "@/components/training/3d-replay-preview";

const identity = { x: 0, y: 0, z: 0, w: 1 };
function frame(segmentId: string, tMs: number, x: number, closed = false): MotionFrame {
  const base = DEFAULT_NEEDLE_PASSING_REFERENCE.frames[0];
  return { tMs, segmentId, normalizedProgress: 0.9,
    leftTool: normalizeToolWithGripOffset({ ...base.leftTool, tipPosition: { x, y: 0.3, z: 0 }, rotation: identity,
      jawClosed: closed, ...(closed ? { heldObjectId: "practice-needle" } : {}) }),
    rightTool: structuredClone(base.rightTool) };
}
function replay(markers: ReplayMarker[], review?: CompletedReplay["review"]): CompletedReplay {
  const userFrames = [frame("approach", 0, 0), frame("approach", 100, 1), frame("approach", 300, 2),
    frame("grip", 400, 3, true), frame("grip", 900, 4, true), frame("complete", 1000, 5)];
  const reference: ReferenceMotion = { ...DEFAULT_NEEDLE_PASSING_REFERENCE,
    frames: [frame("approach", 0, 0), frame("approach", 10, 1), frame("approach", 20, 2), frame("approach", 30, 3),
      frame("grip", 50, 4, true), frame("grip", 70, 5, true), frame("grip", 90, 6, true), frame("grip", 110, 7, true), frame("complete", 120, 8)] };
  return { attemptId: "attempt-1", source: "fixture", markers, review,
    input: { skillId: "needle-passing", userFrames, reference } };
}
const high = (): ReplayMarker => ({ tMs: 15, segmentId: "approach", metricId: "instrumentOrientationAccuracy",
  severity: 0.9, explanationData: { orientationErrorDeg: 40 } });
const low = (): ReplayMarker => ({ tMs: 80, segmentId: "grip", metricId: "pathSimilarity",
  severity: 0.2, explanationData: { tipErrorUnits: 0.02 } });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const state = () => JSON.parse(container.querySelector("[data-testid=replay-state]")!.textContent || "{}") as { timeMs: number; playing: boolean; divergenceEmphasis: boolean; segmentId: string };
const explanation = () => container.querySelector("[data-testid=replay-explanation]")?.textContent ?? "";

describe("S2 narrated replay preview", () => {
  it("focuses the highest marker, shows the explanation, and keeps that text when speech fails", async () => {
    const spoken: string[] = [];
    const audio = new AudioManager({
      fetchFn: async () => { throw new Error("speech route failed"); },
      browserSpeak: (text, onEnd) => { spoken.push(text); onEnd(); },
      cancelBrowserSpeak: () => {},
    });
    await act(async () => root.render(<ThreeDReplayPreview replay={replay([low(), high()])} onClose={() => {}} debug audio={audio} />));
    expect(explanation()).toContain("Instrument Orientation Accuracy (instrumentOrientationAccuracy)");
    expect(explanation()).not.toContain("path difference");
    await flush(700);
    expect(state().divergenceEmphasis).toBe(true);
    expect(state().playing).toBe(false);
    expect(state().segmentId).toBe("approach");
    expect(spoken).toEqual([explanation()]);
    const pausedAt = state().timeMs;
    await flush(250);
    expect(state().timeMs).toBe(pausedAt);
    expect(state().playing).toBe(false);
    expect(explanation()).toContain("Severity 90 out of 100");
  });

  it("speaks a supplied review sentence at the same marker", async () => {
    const spoken: string[] = [];
    const audio = new AudioManager({
      fetchFn: async () => new Response("no", { status: 503 }),
      browserSpeak: (text, onEnd) => { spoken.push(text); onEnd(); },
      cancelBrowserSpeak: () => {},
    });
    const package_ = replay([high()], { replayNarration: "Supplied review sentence." });
    await act(async () => root.render(<ThreeDReplayPreview replay={package_} onClose={() => {}} debug audio={audio} />));
    expect(explanation()).toBe("Supplied review sentence.");
    await flush(700);
    expect(state().segmentId).toBe("approach");
    expect(spoken).toEqual(["Supplied review sentence."]);
  });

  it("skip stops audio immediately and leaves replay controls usable", async () => {
    const spoken: string[] = [];
    const audio = new AudioManager({
      fetchFn: () => new Promise(() => {}),
      browserSpeak: (text, onEnd) => { spoken.push(text); onEnd(); },
      cancelBrowserSpeak: () => {},
    });
    const cancel = vi.spyOn(audio, "cancel");
    await act(async () => root.render(<ThreeDReplayPreview replay={replay([high()])} onClose={() => {}} debug audio={audio} />));
    await act(async () => { container.querySelector<HTMLButtonElement>("[data-testid=replay-skip-narration]")!.click(); });
    expect(cancel).toHaveBeenCalled();
    await flush(700);
    expect(spoken).toEqual([]);
    expect(explanation()).toContain("recorded difference");
    const play = container.querySelector<HTMLButtonElement>("[data-testid=replay-play]")!;
    expect(play.disabled).toBe(false);
    const before = state().timeMs;
    await act(async () => { play.click(); });
    await flush(500);
    const after = state();
    expect(after.playing || after.timeMs !== before).toBe(true);
  });

  it("cancels in-flight speech on unmount and when the user seeks away", async () => {
    let release: (response: Response) => void = () => {};
    let fetches = 0;
    const createAudio = vi.fn();
    const audio = new AudioManager({
      fetchFn: () => { fetches += 1; return new Promise(resolve => { release = resolve; }); },
      createAudio,
      createObjectURL: () => "blob:replay",
      revokeObjectURL: () => {},
      browserSpeak: (_text, onEnd) => onEnd(),
      cancelBrowserSpeak: () => {},
    });
    await act(async () => root.render(<ThreeDReplayPreview replay={{ ...replay([high()]), source: "webcam" }} onClose={() => {}} debug audio={audio} />));
    await flush(700);
    expect(state().divergenceEmphasis).toBe(true);
    expect(fetches).toBe(1);
    const range = container.querySelector<HTMLInputElement>("[aria-label='Replay timeline']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, "0");
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(state().timeMs).toBe(0);
    expect(state().playing).toBe(false);
    release(new Response(new Blob(["x"], { type: "audio/mpeg" }), { status: 200 }));
    await flush(30);
    expect(createAudio).not.toHaveBeenCalled();
  });

  it("holds a selected issue instead of playing through to it", async () => {
    const audio = new AudioManager({
      fetchFn: async () => { throw new Error("speech route failed"); },
      browserSpeak: (_text, onEnd) => onEnd(),
    });
    const selected = low();
    await act(async () => root.render(<ThreeDReplayPreview replay={replay([high(), selected], { replayNarration: "About the largest gap." })}
      initialMarker={selected} onClose={() => {}} debug audio={audio} />));
    expect(state().playing).toBe(false);
    expect(state().divergenceEmphasis).toBe(true);
    expect(state().segmentId).toBe("grip");
    expect(explanation()).toContain("Path Similarity");
    expect(explanation()).not.toContain("About the largest gap.");
  });

  it("shows an empty explanation and does not speak when the attempt has no markers", async () => {
    const spoken: string[] = [];
    const audio = new AudioManager({
      fetchFn: async () => { throw new Error("unused"); },
      browserSpeak: (text, onEnd) => { spoken.push(text); onEnd(); },
    });
    await act(async () => root.render(<ThreeDReplayPreview replay={replay([])} onClose={() => {}} debug audio={audio} />));
    expect(explanation()).toBe("No difference marker was recorded for this attempt.");
    expect(container.querySelector("[data-testid=replay-skip-narration]")).toBeNull();
    await flush(400);
    expect(spoken).toEqual([]);
    expect(state().divergenceEmphasis).toBe(false);
  });
});
