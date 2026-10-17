"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { pickupFeedback, ToolSimulationController } from "@/lib/simulation/tool-simulation";
import type { ControlSnapshot } from "@/lib/vision/control-types";
import type { SceneDiagnostics } from "@/components/scene/training-scene";

const TrainingScene = dynamic(() => import("@/components/scene/training-scene"), { ssr: false, loading: () => <p>Loading 3D workspace…</p> });
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <p>3D rendering is unavailable. Enable WebGL and retry the scene.</p> : this.props.children; }
}

export function ThreeDTrainingPreview({ controlsRef, calibrated, debug }: { controlsRef: RefObject<ControlSnapshot>; calibrated: boolean; debug: boolean }) {
  const [controller] = useState(() => new ToolSimulationController());
  const diagnosticsRef = useRef<SceneDiagnostics | null>(null);
  const [sample, setSample] = useState<SceneDiagnostics | null>(null);
  const [timing, setTiming] = useState({ medianFps: 0, p95FrameMs: 0, sampleCount: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "lost" | "error">("loading");
  const [generation, setGeneration] = useState(0);
  const [assisted, setAssisted] = useState(true);
  const onStatus = useCallback((value: "ready" | "lost") => setStatus(value), []);
  const onFailure = useCallback(() => { controller.suspend("3D rendering unavailable."); setStatus("error"); }, [controller]);
  // This also runs while the renderer has failed and its frame callback is absent.
  useEffect(() => { if (!calibrated) controller.reset(); }, [calibrated, controller]);
  useEffect(() => {
    const interval = setInterval(() => {
      const diagnostics = diagnosticsRef.current;
      setSample(diagnostics ? { ...diagnostics, snapshot: controller.snapshot } : null);
      setTiming(diagnostics?.timing.read() ?? { medianFps: 0, p95FrameMs: 0, sampleCount: 0 });
    }, 250);
    return () => { clearInterval(interval); controller.reset(); diagnosticsRef.current = null; };
  }, [controller]);
  const reset = () => { controller.reset(); setSample(null); };
  const retry = () => { reset(); setStatus("loading"); setGeneration(value => value + 1); };
  const snapshot = sample?.snapshot;
  const feedback = snapshot ? pickupFeedback(snapshot) : null;
  return <section aria-label="Virtual instrument preview" className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Virtual instruments</h2>
      <div className="flex gap-3">
        <button className="rounded-md border px-4 py-2" onClick={reset}>Reset scene</button>
        {(status === "error" || status === "lost") && <button className="rounded-md border px-4 py-2" onClick={retry}>Retry 3D scene</button>}
      </div>
    </div>
    <ol className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Pickup instructions">
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>1. Open</strong><br />Separate thumb and index finger.</li>
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>2. Aim</strong><br />Move a cyan or amber tip ring inside the needle’s circle.</li>
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>3. Pinch</strong><br />When the circle turns green, pinch to pick up. Open to release.</li>
    </ol>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={assisted} onChange={event => { const enabled = event.target.checked; controller.setAssisted(enabled); setAssisted(enabled); setSample(null); }} className="mt-1" /><span><strong>Easy pickup</strong> — keeps the tips at the needle’s depth and snaps it into the jaws. Turning this off enables free 3D depth and resets the needle.</span></label>
    <p data-testid="simulation-status" aria-live="polite">{status === "error" ? "3D rendering unavailable" : status === "lost" ? "Simulation paused: 3D context lost" : status === "loading" ? "Loading 3D workspace" : snapshot?.reason ?? "Calibrate both hands to begin."}</p>
    <div className="h-[420px] overflow-hidden rounded-lg bg-slate-950">
      <SceneBoundary key={generation} onFailure={onFailure}>
        <TrainingScene controlsRef={controlsRef} controller={controller} diagnosticsRef={diagnosticsRef} onStatus={onStatus} />
      </SceneBoundary>
    </div>
    <p data-testid="pickup-guidance" aria-live="polite" className={`rounded-lg border p-3 font-medium ${feedback?.ready ? "border-green-500 bg-green-50 text-green-950" : "border-slate-300"}`}>{feedback?.message ?? "Calibrate both hands to begin."}</p>
    <p data-testid="needle-ownership">Needle: {snapshot?.object.heldBy ?? "free"}</p>
    <p className="text-sm text-zinc-500">Cyan: left hand. Amber: right hand. Keep both hands visible; tracking loss pauses both instruments.</p>
    {debug && <div aria-label="Simulation diagnostics" className="space-y-2 break-all font-mono text-xs">
      <p>Render FPS: {sample?.fps ?? 0} | Frames: {sample?.frames ?? 0} | Source: {snapshot?.sourceTMs ?? "none"}</p>
      <p>Median render FPS: {timing.medianFps.toFixed(1)} | p95 frame: {timing.p95FrameMs.toFixed(1)} ms | Samples: {timing.sampleCount}</p>
      {(["left", "right"] as const).map(slot => <p key={slot} data-testid={`${slot}-instrument-state`}>{slot}: {JSON.stringify({ sourceTMs: snapshot?.sourceTMs ?? null, tool: snapshot?.[slot] ?? null, rendered: sample?.rendered[slot] ?? null })}</p>)}
      <p data-testid="needle-state">{JSON.stringify({ object: snapshot?.object ?? null, rendered: sample?.rendered.object ?? null })}</p>
    </div>}
  </section>;
}
