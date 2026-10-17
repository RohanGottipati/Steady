"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ReplayController, type ReplayMode, type ReplaySpeed } from "@/lib/simulation/replay-controller";
import type { CompletedReplay } from "@/lib/simulation/replay-types";
import type { ReplayMarker } from "@/types";
import type { ReplayDiagnostics } from "@/components/scene/replay-scene";

let replaySceneModule: Promise<typeof import("@/components/scene/replay-scene")> | undefined;
/** Share the exact import with the client loader, including Next's chunk entry. */
export function preloadReplayScene() {
  replaySceneModule ??= import("@/components/scene/replay-scene").catch(error => { replaySceneModule = undefined; throw error; });
  return replaySceneModule;
}
class ReplayBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <p>3D replay is unavailable. Enable WebGL and retry.</p> : this.props.children; }
}

/** Minimal A6 harness. B8 can use ReplayController/ReplayScene with its own UI. */
export function ThreeDReplayPreview({ replay, onClose, debug = false, initialMarker }: { replay: CompletedReplay; onClose: () => void; debug?: boolean; initialMarker?: ReplayMarker }) {
  const [loaded] = useState(() => {
    try {
      const controller = new ReplayController(replay.input);
      // B8: when opened from a results worst-moment, land on that issue; else task start.
      if (!initialMarker || !controller.seekMarker(initialMarker)) controller.seekToTaskStart();
      return { controller, error: null };
    }
    catch (error) { return { controller: null, error: error instanceof Error ? error.message : "This recording could not be loaded." }; }
  });
  const controller = loaded.controller;
  const [snapshot, setSnapshot] = useState(controller?.snapshot ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "lost" | "error">("loading");
  const [generation, setGeneration] = useState(0);
  const [Scene, setScene] = useState<typeof import("@/components/scene/replay-scene").default | null>(null);
  const [seekError, setSeekError] = useState<string | null>(null);
  const diagnosticsRef = useRef<ReplayDiagnostics | null>(null);
  const [rendered, setRendered] = useState<ReplayDiagnostics | null>(null);
  const onStatus = useCallback((next: "ready" | "lost") => setStatus(next), []);
  const onFailure = useCallback(() => { controller?.pause(); setStatus("error"); }, [controller]);
  useEffect(() => {
    // Loading only in an effect keeps Canvas client-only. An explicit loader
    // avoids a distinct next/dynamic chunk entry defeating the offline preload,
    // and permits retry after a rejected download (React.lazy caches rejections).
    let active = true;
    void preloadReplayScene().then(module => { if (active) setScene(() => module.default); })
      .catch(() => { if (active) onFailure(); });
    return () => { active = false; };
  }, [generation, onFailure]);
  useEffect(() => {
    if (!controller) return;
    const timer = setInterval(() => { setSnapshot(controller.snapshot); if (debug) setRendered(diagnosticsRef.current); }, 250);
    return () => { clearInterval(timer); controller.pause(); };
  }, [controller, debug]);
  const change = (action: (controller: ReplayController) => void) => {
    if (!controller) return;
    action(controller); setSnapshot(controller.snapshot);
  };
  return <section aria-label="Attempt replay" className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Attempt replay</h2>
      <button type="button" onClick={onClose} className="rounded-md border px-3 py-2">Back to training</button>
    </div>
    {replay.source === "fixture" && <p className="text-sm font-medium">Demonstration recording — this is synthetic motion, not your performance.</p>}
    <p className="text-sm">Solid cyan/amber: recorded tools. Translucent lavender: canonical scene guide (synthetic). Pink lines show the current tip differences.</p>
    {loaded.error && <p role="alert">{loaded.error}</p>}
    {controller && snapshot && <>
      <div className="flex flex-wrap items-center gap-3 text-sm" role="group" aria-label="Replay controls">
        <button type="button" data-testid="replay-play" disabled={status !== "ready" || !snapshot.user || snapshot.durationMs === 0}
          onClick={() => change(c => { if (c.snapshot.playing) c.pause(); else c.play(); })} className="rounded border px-3 py-2 disabled:opacity-50">
          {snapshot.playing ? "Pause replay" : "Play replay"}
        </button>
        <label>Speed <select aria-label="Replay speed" value={snapshot.speed} onChange={event => change(c => c.setSpeed(Number(event.target.value) as ReplaySpeed))}>
          {[0.25, 0.5, 1].map(speed => <option key={speed} value={speed}>{speed}x</option>)}
        </select></label>
        <label>Compare <select aria-label="Replay comparison mode" value={snapshot.mode} onChange={event => change(c => c.setMode(event.target.value as ReplayMode))}>
          <option value="synchronized">Synchronized comparison</option><option value="original">Original timing</option>
        </select></label>
        <label><input type="checkbox" checked={snapshot.showExpert} onChange={event => change(c => c.setShowExpert(event.target.checked))} /> Show reference</label>
        <label><input type="checkbox" checked={snapshot.showPaths} onChange={event => change(c => c.setShowPaths(event.target.checked))} /> Show paths</label>
        <label><input type="checkbox" checked={snapshot.smoothing === "centered-7"} onChange={event => change(c => c.setSmoothing(event.target.checked ? "centered-7" : "recorded"))} /> Smooth replay</label>
      </div>
      <input type="range" aria-label="Replay timeline" min={0} max={1000} step={1} value={Math.round(snapshot.progress * 1000)}
        onChange={event => change(c => c.seekProgress(Number(event.target.value) / 1000))} className="w-full" />
      <p data-testid="replay-position" className="text-sm">{(snapshot.timeMs / 1000).toFixed(2)} / {(snapshot.durationMs / 1000).toFixed(2)} s · Segment: {snapshot.segmentId ?? "none"} ({Math.round(snapshot.segmentProgress * 100)}%)</p>
      <p className="text-xs text-zinc-500">Original timing uses the recorded active-attempt clock; tracking suspensions are excluded. Smoothing changes this display only. Scores stay unchanged.</p>
      {snapshot.message && <p className="text-sm">{snapshot.message}</p>}
      <p data-testid="replay-status" aria-live="polite">{status === "ready" ? "Replay ready — camera independent" : status === "lost" ? "Replay paused: 3D context lost" : status === "error" ? "3D replay unavailable" : "Loading replay"}</p>
      <div className="h-[420px] overflow-hidden rounded-lg bg-slate-950">
        <ReplayBoundary key={generation} onFailure={onFailure}>
          {Scene ? <Scene controller={controller} diagnosticsRef={diagnosticsRef} onStatus={onStatus} /> : <p>Loading 3D replay…</p>}
        </ReplayBoundary>
      </div>
      {(status === "error" || status === "lost") && <button type="button" className="rounded border px-3 py-2"
        onClick={() => { controller.pause(); setStatus("loading"); setGeneration(value => value + 1); }}>Retry replay scene</button>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Replay issue markers">
        {replay.markers.map((marker, index) => <button type="button" key={`${marker.metricId}-${index}`} data-testid={`replay-marker-${index}`}
          onClick={() => change(c => { setSeekError(c.seekMarker(marker) ? null : "This issue's segment is unavailable in the recording."); })}
          className="rounded border px-3 py-2 text-sm">Issue {index + 1}: {marker.segmentId}</button>)}
      </div>
      {seekError && <p role="alert">{seekError}</p>}
      <div className="flex flex-wrap gap-4 text-xs" aria-label="Replay geometric differences">
        {(["left", "right"] as const).map(side => <span key={side}>{side}: {snapshot.deviations[side]
          ? `${snapshot.deviations[side]!.distance.toFixed(3)} scene units · ${snapshot.deviations[side]!.angleDeg.toFixed(1)}°` : "comparison unavailable"}</span>)}
      </div>
      {debug && <pre data-testid="replay-state" className="break-all whitespace-pre-wrap text-xs">{JSON.stringify({ ...snapshot, rendered })}</pre>}
    </>}
  </section>;
}
