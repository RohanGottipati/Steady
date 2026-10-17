"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReplayController, type ReplayMode, type ReplaySpeed, type ReplaySnapshot } from "@/lib/simulation/replay-controller";
import { planReplayNarration, type ReplayNarrationPlan } from "@/lib/simulation/replay-narration";
import type { CompletedReplay } from "@/lib/simulation/replay-types";
import type { ReplayMarker } from "@/types";
import type { ReplayDiagnostics } from "@/components/scene/replay-scene";
import { AudioManager } from "@/lib/voice/audio-manager";
import { ViewportLoading } from "./viewport-loading";

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
  render() { return this.state.failed ? <p className="p-4 text-sm text-slate-100">3D replay is unavailable. Enable WebGL and retry.</p> : this.props.children; }
}

type FocusNote = "pending" | "armed" | "missing" | "none";

function markersMatch(a: ReplayMarker | null, b: ReplayMarker) {
  return !!a && a.tMs === b.tMs && a.segmentId === b.segmentId && a.metricId === b.metricId && a.severity === b.severity;
}
function focusStatus(plan: ReplayNarrationPlan, snapshot: ReplaySnapshot | null, focusNote: FocusNote, held: boolean) {
  if (focusNote === "missing") return "This issue's segment is unavailable in the recording.";
  if (snapshot?.divergenceEmphasis) return held ? "Paused on the selected difference." : "Paused at the largest recorded difference.";
  if (snapshot?.playing && plan.marker) return "Playing to the largest recorded difference.";
  if (plan.source === "review") return "Review narration";
  return "Largest recorded difference";
}

/** A6/B8 replay surface plus S2 narration. B9 can replace `review.replayNarration`. */
export function ThreeDReplayPreview({ replay, onClose, debug = false, initialMarker, audio }: {
  replay: CompletedReplay;
  onClose: () => void;
  debug?: boolean;
  /** B8: open already seeked to this issue and hold it. */
  initialMarker?: ReplayMarker;
  /** Injected in tests. Production keeps one manager for this mount. */
  audio?: AudioManager;
}) {
  const [selectedMarker, setSelectedMarker] = useState(initialMarker);
  const held = selectedMarker != null;
  const plan = useMemo(() => planReplayNarration({
    skillId: replay.input.skillId, markers: replay.markers, review: replay.review, focus: selectedMarker,
  }), [replay, selectedMarker]);
  const [loaded] = useState(() => {
    try {
      const controller = new ReplayController(replay.input);
      controller.seekToTaskStart();
      let focusNote: FocusNote = "none";
      if (plan.marker) {
        if (held) {
          // Results already chose the issue. Land on it and narrate; do not play past it.
          focusNote = controller.seekMarker(plan.marker) && controller.armFocusPause(plan.marker) ? "armed" : "missing";
        } else focusNote = controller.armFocusPause(plan.marker) ? "armed" : "missing";
      }
      return { controller, error: null as string | null, focusNote, focusMarker: plan.marker };
    }
    catch (error) {
      return { controller: null, error: error instanceof Error ? error.message : "This recording could not be loaded.", focusNote: "pending" as FocusNote, focusMarker: null };
    }
  });
  const controller = loaded.controller;
  const focusNote = loaded.focusNote;
  const [snapshot, setSnapshot] = useState(controller?.snapshot ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "lost" | "error">("loading");
  const [generation, setGeneration] = useState(0);
  const [Scene, setScene] = useState<typeof import("@/components/scene/replay-scene").default | null>(null);
  const [seekError, setSeekError] = useState<string | null>(null);
  const diagnosticsRef = useRef<ReplayDiagnostics | null>(null);
  const [rendered, setRendered] = useState<ReplayDiagnostics | null>(null);
  const audioRef = useRef<AudioManager | null>(audio ?? null);
  const narration = useRef({ spoken: false, released: false, takenOver: false });
  const onStatus = useCallback((next: "ready" | "lost") => {
    setStatus(next);
    // Scene mount/teardown pauses the controller. Resume the armed approach
    // after it reports ready, unless the user already took the timeline.
    if (next !== "ready" || !controller || !loaded.focusMarker || narration.current.takenOver) return;
    if (controller.snapshot.divergenceEmphasis) return;
    controller.armFocusPause(loaded.focusMarker);
  }, [controller, loaded.focusMarker]);
  const onFailure = useCallback(() => { controller?.pause(); setStatus("error"); }, [controller]);
  const manager = useCallback(() => {
    if (audio) return audio;
    audioRef.current ??= new AudioManager();
    return audioRef.current;
  }, [audio]);
  const stopNarration = useCallback(() => {
    narration.current.released = true;
    (audio ?? audioRef.current)?.cancel();
  }, [audio]);
  const takeOver = useCallback(() => {
    narration.current.takenOver = true;
    controller?.clearFocusPause();
    stopNarration();
  }, [stopNarration, controller]);
  useEffect(() => () => { (audio ?? audioRef.current)?.cancel(); }, [audio]);
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
  useEffect(() => {
    if (status !== "ready" || !plan.text || narration.current.spoken || narration.current.released || focusNote === "pending") return;
    const waitingForMarker = focusNote === "armed" && !snapshot?.divergenceEmphasis;
    if (waitingForMarker) return;
    narration.current.spoken = true;
    // Speech never seeks or restarts the controller. Arrival already paused it.
    void manager().speak(plan.text, { priority: "high", allowLive: replay.source !== "fixture" }).catch(() => {});
  }, [status, plan.text, focusNote, snapshot?.divergenceEmphasis, manager, replay.source]);
  const change = (action: (controller: ReplayController) => void) => {
    if (!controller) return;
    action(controller); setSnapshot(controller.snapshot);
  };
  const sameMarker = (candidate: CompletedReplay["markers"][number]) => markersMatch(plan.marker, candidate);
  return <section aria-label="Attempt replay" className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Attempt replay</h2>
      <button type="button" onClick={onClose} className="rounded-md border px-3 py-2">Back to training</button>
    </div>
    {replay.source === "fixture" && <p className="text-sm font-medium">Demonstration recording — this is synthetic motion, not your performance.</p>}
    <p className="text-sm">Solid cyan/amber: recorded tools. Translucent lavender: canonical scene guide (synthetic). Pink lines show the current tip differences.</p>
    <p data-testid="replay-explanation" data-source={plan.source} className="text-sm" aria-live="polite">
      {plan.text ?? "No difference marker was recorded for this attempt."}
    </p>
    {plan.text && <div className="flex flex-wrap items-center gap-3 text-sm">
      <p data-testid="replay-focus">{focusStatus(plan, snapshot, focusNote, held)}</p>
      <button type="button" data-testid="replay-skip-narration" onClick={stopNarration} className="rounded border px-3 py-2">Skip narration</button>
    </div>}
    {loaded.error && <p role="alert">{loaded.error}</p>}
    {status === "error" && (
      <div role="alert" data-testid="replay-load-error" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400 p-3 text-sm">
        <p>Replay could not finish loading. Retry the 3D view or go back to training. Your scores stay available.</p>
        <button type="button" className="rounded border px-3 py-1" onClick={() => { controller?.pause(); setStatus("loading"); setGeneration(value => value + 1); }}>Retry replay</button>
      </div>
    )}
    {controller && snapshot && <>
      <div className="flex flex-wrap items-center gap-3 text-sm" role="group" aria-label="Replay controls">
        <button type="button" data-testid="replay-play" disabled={status !== "ready" || !snapshot.user || snapshot.durationMs === 0}
          onClick={() => { takeOver(); change(c => { if (snapshot.playing) c.pause(); else c.play(); }); }} className="rounded border px-3 py-2 disabled:opacity-50">
          {snapshot.playing ? "Pause replay" : "Play replay"}
        </button>
        <label>Speed <select aria-label="Replay speed" value={snapshot.speed} onChange={event => change(c => c.setSpeed(Number(event.target.value) as ReplaySpeed))}>
          {[0.25, 0.5, 1].map(speed => <option key={speed} value={speed}>{speed}x</option>)}
        </select></label>
        <label>Compare <select aria-label="Replay comparison mode" value={snapshot.mode} onChange={event => { takeOver(); change(c => c.setMode(event.target.value as ReplayMode)); }}>
          <option value="synchronized">Synchronized comparison</option><option value="original">Original timing</option>
        </select></label>
        <label><input type="checkbox" checked={snapshot.showExpert} onChange={event => change(c => c.setShowExpert(event.target.checked))} /> Show reference</label>
        <label><input type="checkbox" checked={snapshot.showPaths} onChange={event => change(c => c.setShowPaths(event.target.checked))} /> Show paths</label>
        <label><input type="checkbox" checked={snapshot.smoothing === "centered-7"} onChange={event => change(c => c.setSmoothing(event.target.checked ? "centered-7" : "recorded"))} /> Smooth replay</label>
      </div>
      <input type="range" aria-label="Replay timeline" min={0} max={1000} step={1} value={Math.round(snapshot.progress * 1000)}
        onPointerDown={() => { takeOver(); change(c => c.pause()); }}
        onKeyDown={event => {
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            takeOver();
            change(c => c.seekProgress(event.key === "Home" ? 0 : 1));
          }
        }}
        onChange={event => { takeOver(); change(c => c.seekProgress(Number(event.target.value) / 1000)); }} className="w-full" />
      <p data-testid="replay-position" className="text-sm">{(snapshot.timeMs / 1000).toFixed(2)} / {(snapshot.durationMs / 1000).toFixed(2)} s · Segment: {snapshot.segmentId ?? "none"} ({Math.round(snapshot.segmentProgress * 100)}%)</p>
      <p className="text-xs text-zinc-500">Original timing follows the attempt and skips moments when tracking paused. Smoothing changes only this view. Scores stay the same.</p>
      {snapshot.message && <p className="text-sm">{snapshot.message}</p>}
      <p data-testid="replay-status" aria-live="polite">{status === "ready" ? "Replay ready. The camera can stay off." : status === "lost" ? "Replay paused: 3D context lost" : status === "error" ? "3D replay unavailable" : "Loading replay"}</p>
      <div className="relative h-[min(420px,70vh)] overflow-hidden rounded-lg bg-slate-950">
        <ReplayBoundary key={generation} onFailure={onFailure}>
          {Scene ? <Scene controller={controller} diagnosticsRef={diagnosticsRef} onStatus={onStatus} skillId={replay.input.skillId} />
            : status === "error" ? <p className="p-4 text-slate-100">Replay could not load. Retry when your connection returns.</p> : null}
        </ReplayBoundary>
        {status === "loading" && <ViewportLoading label="Loading replay" />}
      </div>
      {(status === "error" || status === "lost") && <button type="button" className="rounded border px-3 py-2"
        onClick={() => { controller.pause(); setStatus("loading"); setGeneration(value => value + 1); }}>Retry replay scene</button>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Replay issue markers">
        {replay.markers.map((marker, index) => <button type="button" key={`${marker.metricId}-${index}`} data-testid={`replay-marker-${index}`}
          aria-current={sameMarker(marker) && snapshot.divergenceEmphasis ? "true" : undefined}
          onClick={() => { takeOver(); change(c => {
            const found = c.seekMarker(marker);
            setSeekError(found ? null : "This issue's segment is unavailable in the recording.");
            if (found) { c.armFocusPause(marker); setSelectedMarker(marker); }
          }); }}
          className={`rounded border px-3 py-2 text-sm ${sameMarker(marker) && snapshot.divergenceEmphasis ? "border-rose-600 bg-rose-50" : ""}`}>Issue {index + 1}: {marker.segmentId}</button>)}
      </div>
      {seekError && <p role="alert">{seekError}</p>}
      <div className="flex flex-wrap gap-4 text-xs" aria-label="Replay geometric differences">
        {(["left", "right"] as const).map(side => <span key={side}>{side}: {snapshot.deviations[side]
          ? `${snapshot.deviations[side]!.distance.toFixed(3)} apart · ${snapshot.deviations[side]!.angleDeg.toFixed(1)}°` : "comparison unavailable"}</span>)}
      </div>
      {debug && <pre data-testid="replay-state" className="break-all whitespace-pre-wrap text-xs">{JSON.stringify({ ...snapshot, rendered })}</pre>}
    </>}
  </section>;
}
