"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { buildDeterministicReview } from "@/lib/ai/deterministic-review";
import { type CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { FIXTURE_CATALOG, type FixtureId } from "@/lib/exercise/fixture-playback";
import { type GhostPlaybackSpeed, type GhostSyncMode } from "@/lib/exercise/ghost-playback";
import { DEFAULT_NEEDLE_PASSING_REFERENCE, GHOST_REFERENCE_SOURCES, type GhostReferenceSourceId } from "@/lib/exercise/ghost-reference";
import { loadReference } from "@/lib/references/load-reference";
import { pickupFeedback } from "@/lib/simulation/tool-simulation";
import type { ControlSnapshot } from "@/lib/vision/control-types";
import type { SceneDiagnostics } from "@/components/scene/training-scene";
import type { ReferenceMotion, ReplayMarker, SkillDefinition, TrainingMode } from "@/types";
import { AttemptResultsPanel } from "./attempt-results-panel";
import { preloadReplayScene, ThreeDReplayPreview } from "./3d-replay-preview";

const TrainingScene = dynamic(() => import("@/components/scene/training-scene"), { ssr: false, loading: () => <p>Loading 3D workspace…</p> });
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <p>3D rendering is unavailable. Enable WebGL and retry the scene.</p> : this.props.children; }
}

export function ThreeDTrainingPreview({
  controlsRef,
  calibrated,
  debug,
  skill = needlePassingSkill,
  mode: controlledMode,
  onModeChange,
  singleHand: controlledSingleHand,
  onQuickSingleHand,
  onSingleHandChange,
  fixtureId = null,
  onFixtureChange,
  onEvaluationComplete,
}: {
  controlsRef: RefObject<ControlSnapshot>;
  calibrated: boolean;
  debug: boolean;
  skill?: SkillDefinition;
  mode?: TrainingMode;
  onModeChange?: (mode: TrainingMode) => void;
  singleHand?: boolean;
  onQuickSingleHand?: () => void;
  onSingleHandChange?: (enabled: boolean) => void;
  fixtureId?: FixtureId | null;
  onFixtureChange?: (fixtureId: FixtureId | null) => void;
  onEvaluationComplete?: (bundle: CompletedAttemptBundle | null) => void;
}) {
  const [runtime] = useState(() => new TrainingRuntime(skill, controlledMode ?? "learn"));
  useSyncExternalStore(runtime.subscribe, runtime.getGeneration, runtime.getGeneration);
  const controller = runtime.simulation, exercise = runtime.exercise, ghost = runtime.ghost;
  const referenceCacheRef = useRef<Partial<Record<GhostReferenceSourceId, ReferenceMotion>>>({
    "synthetic-v1": DEFAULT_NEEDLE_PASSING_REFERENCE,
  });
  const referenceRequestRef = useRef(0);
  const diagnosticsRef = useRef<SceneDiagnostics | null>(null);
  const notifiedBundleRef = useRef<CompletedAttemptBundle | null>(null);
  const evaluationCallbackRef = useRef(onEvaluationComplete);
  useEffect(() => { evaluationCallbackRef.current = onEvaluationComplete; }, [onEvaluationComplete]);
  const [sample, setSample] = useState<SceneDiagnostics | null>(null);
  const [timing, setTiming] = useState({ medianFps: 0, p95FrameMs: 0, sampleCount: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "lost" | "error">("loading");
  const [generation, setGeneration] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [replayMarker, setReplayMarker] = useState<ReplayMarker | null>(null);
  const [assisted, setAssisted] = useState(true);
  const [localSingleHand, setLocalSingleHand] = useState(controlledSingleHand ?? false);
  const singleHand = controlledSingleHand ?? localSingleHand;
  const [localMode, setLocalMode] = useState<TrainingMode>(controlledMode ?? "learn");
  const mode = controlledMode ?? localMode;
  const [ghostSpeed, setGhostSpeed] = useState<GhostPlaybackSpeed>(1);
  const [ghostSync, setGhostSync] = useState<GhostSyncMode>("progress-coupled");
  const [ghostSource, setGhostSource] = useState<GhostReferenceSourceId>("synthetic-v1");
  const [loadingReference, setLoadingReference] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [, setUiTick] = useState(0);
  const onStatus = useCallback((value: "ready" | "lost") => setStatus(value), []);
  const onFailure = useCallback(() => { runtime.suspend("3D rendering unavailable."); setStatus("error"); }, [runtime]);

  useEffect(() => {
    // Fetch the client-only renderer while training is online, so first review
    // does not need a chunk download after connectivity is lost mid-attempt.
    void preloadReplayScene().catch(() => {});
  }, []);

  useEffect(() => { runtime.configure(mode, fixtureId, singleHand, assisted); }, [runtime, mode, fixtureId, singleHand, assisted]);
  useEffect(() => { if (!calibrated) runtime.invalidateCalibration(); }, [calibrated, runtime]);
  useEffect(() => {
    const referenceRequests = referenceRequestRef;
    const resume = setTimeout(() => setLoadingReference(false), 0);
    const interval = setInterval(() => {
      const diagnostics = diagnosticsRef.current;
      setSample(diagnostics ? { ...diagnostics, snapshot: controller.snapshot, exercise: exercise.snapshot, ghost: ghost.snapshot } : null);
      setTiming(diagnostics?.timing.read() ?? { medianFps: 0, p95FrameMs: 0, sampleCount: 0 });
      if (notifiedBundleRef.current !== runtime.bundle) {
        notifiedBundleRef.current = runtime.bundle;
        evaluationCallbackRef.current?.(runtime.bundle);
      }
      setUiTick(value => value + 1);
    }, 250);
    return () => {
      clearInterval(interval); clearTimeout(resume); referenceRequests.current++; runtime.reset(); diagnosticsRef.current = null;
    };
  }, [runtime, controller, exercise, ghost]);
  const reset = useCallback(() => { runtime.reset(); setSample(null); setUiTick(value => value + 1); }, [runtime]);
  const retry = useCallback(() => { reset(); setStatus("loading"); setGeneration(value => value + 1); }, [reset]);
  const openReplay = useCallback((marker: ReplayMarker | null = null) => {
    runtime.suspend("Reviewing completed attempt.");
    setReplayMarker(marker);
    setReplaying(true);
  }, [runtime]);
  const closeReplay = useCallback(() => { runtime.reset(); setReplaying(false); setReplayMarker(null); setStatus("loading"); }, [runtime]);
  const selectMode = (nextMode: TrainingMode) => {
    setLocalMode(nextMode); onModeChange?.(nextMode);
  };

  const selectGhostSpeed = (nextSpeed: GhostPlaybackSpeed) => { ghost.setSpeed(nextSpeed); setGhostSpeed(nextSpeed); setUiTick(value => value + 1); };
  const toggleGhostSync = () => {
    const nextSync: GhostSyncMode = ghostSync === "progress-coupled" ? "continuous" : "progress-coupled";
    ghost.setSyncMode(nextSync);
    setGhostSync(nextSync);
    setUiTick(value => value + 1);
  };
  const activateSingleHandQuickStart = () => {
    runtime.reset();
    setLocalSingleHand(true);
    onSingleHandChange?.(true);
    onQuickSingleHand?.();
    setUiTick(value => value + 1);
  };
  const toggleSingleHandMode = (enabled: boolean) => {
    setLocalSingleHand(enabled);
    onSingleHandChange?.(enabled);
    setUiTick(value => value + 1);
  };
  const selectGhostReference = async (sourceId: GhostReferenceSourceId) => {
    const request = ++referenceRequestRef.current;
    setReferenceError(null);
    const cached = referenceCacheRef.current[sourceId];
    if (cached) {
      ghost.setReference(cached, sourceId);
      setGhostSource(sourceId);
      setUiTick(value => value + 1);
      return;
    }
    const item = GHOST_REFERENCE_SOURCES.find(entry => entry.id === sourceId);
    if (!item) return;
    setLoadingReference(true);
    try {
      const loaded = await loadReference(item.url);
      if (request !== referenceRequestRef.current) return;
      referenceCacheRef.current[sourceId] = loaded;
      ghost.setReference(loaded, sourceId);
      setGhostSource(sourceId);
      setUiTick(value => value + 1);
    } catch {
      if (request !== referenceRequestRef.current) return;
      setReferenceError(`Could not load ${item.label}; keeping active reference.`);
    } finally {
      if (request === referenceRequestRef.current) setLoadingReference(false);
    }
  };
  const snapshot = controller.snapshot;
  const exerciseSnapshot = exercise.snapshot;
  const ghostSnapshot = ghost.snapshot;
  const activeEvaluationBundle = runtime.bundle;
  const feedback = snapshot ? pickupFeedback(snapshot) : null;
  const review = activeEvaluationBundle ? buildDeterministicReview(activeEvaluationBundle) : null;
  if (replaying && runtime.lastReplay) return <ThreeDReplayPreview key={runtime.lastReplay.attemptId}
    replay={runtime.lastReplay} debug={debug} initialMarker={replayMarker ?? undefined} onClose={closeReplay} />;
  return <section aria-label="Virtual instrument preview" className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Virtual instruments</h2>
      <div className="flex flex-wrap gap-2">
        {runtime.lastReplay && <button type="button" data-testid="open-attempt-replay" className="rounded-md border px-4 py-2"
          onClick={() => openReplay()}>Replay latest attempt</button>}
        <button
          type="button"
          data-testid="quick-single-hand-start"
          onClick={activateSingleHandQuickStart}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          1-Hand Quick Start (Use 1 hand only)
        </button>
        <button className="rounded-md border px-4 py-2" onClick={reset}>Reset scene</button>
        {(status === "error" || status === "lost") && <button className="rounded-md border px-4 py-2" onClick={retry}>Retry 3D scene</button>}
      </div>
    </div>
    {fixtureId && (
      <div
        role="region"
        aria-label="Fixture playback controls"
        data-testid="fixture-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Demo Fixture Mode:</span>
          <select
            aria-label="Select motion fixture"
            data-testid="fixture-select"
            value={fixtureId}
            onChange={event => onFixtureChange?.(event.target.value as FixtureId)}
            className="rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-indigo-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {FIXTURE_CATALOG.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="fixture-restart"
            onClick={reset}
            className="rounded border border-indigo-300 bg-white px-2.5 py-1 font-medium text-indigo-900 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-100"
          >
            Restart fixture
          </button>
        </div>
      </div>
    )}
    <div role="group" aria-label="Training mode" className="flex flex-wrap items-center gap-2 text-sm">
      {!onModeChange && (["learn", "practice", "assessment"] as const).map(candidate => (
        <button
          key={candidate}
          type="button"
          data-testid={`mode-${candidate}`}
          aria-pressed={mode === candidate}
          onClick={() => selectMode(candidate)}
          className={`rounded-md border px-3 py-1.5 capitalize ${mode === candidate ? "border-emerald-600 bg-emerald-50 font-medium text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-300"}`}
        >
          {candidate} mode
        </button>
      ))}
      {exerciseSnapshot.phase === "demonstration" && (
        <button type="button" data-testid="start-attempt" className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 font-medium text-blue-950" onClick={() => { exercise.startAttempt(); setUiTick(value => value + 1); }}>
          Start attempt
        </button>
      )}
      {exerciseSnapshot.modeHooks.canToggleGhost && (
        <button type="button" data-testid="ghost-toggle" className="rounded-md border px-3 py-1.5" onClick={() => { exercise.toggleGhost(); setUiTick(value => value + 1); }}>
          {exerciseSnapshot.modeHooks.ghostVisible ? "Hide ghost" : "Show ghost"}
        </button>
      )}
    </div>
    {mode !== "assessment" && (
      <div role="group" aria-label="Ghost playback controls" className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Ghost playback:</span>
        {([0.5, 1] as const).map(candidateSpeed => (
          <button
            key={candidateSpeed}
            type="button"
            data-testid={`ghost-speed-${candidateSpeed}x`}
            aria-pressed={ghostSpeed === candidateSpeed}
            onClick={() => selectGhostSpeed(candidateSpeed)}
            className={`rounded border px-2.5 py-1 ${ghostSpeed === candidateSpeed ? "border-sky-600 bg-sky-50 font-semibold text-sky-950 dark:bg-sky-950/40 dark:text-sky-100" : "border-slate-300"}`}
          >
            {candidateSpeed}x
          </button>
        ))}
        <button
          type="button"
          data-testid="ghost-sync-toggle"
          onClick={toggleGhostSync}
          className="rounded border border-slate-300 px-2.5 py-1"
        >
          Sync: {ghostSync === "progress-coupled" ? "Progress-coupled" : "Continuous loop"}
        </button>
        <label className="flex items-center gap-1.5">
          <span className="text-zinc-500">Reference:</span>
          <select
            data-testid="ghost-reference-select"
            value={ghostSource}
            disabled={loadingReference}
            onChange={event => void selectGhostReference(event.target.value as GhostReferenceSourceId)}
            className="rounded border border-slate-300 bg-transparent px-2 py-1"
          >
            {GHOST_REFERENCE_SOURCES.map(source => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        {ghostSnapshot.attribution && (
          <p data-testid="ghost-attribution" className="w-full text-[11px] text-zinc-500 dark:text-zinc-400">
            Attribution: {ghostSnapshot.attribution}
          </p>
        )}
        {referenceError && (
          <p role="alert" className="w-full text-[11px] text-amber-600">
            {referenceError}
          </p>
        )}
      </div>
    )}
    <ol className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Pickup instructions">
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>1. Use ONE Instrument</strong><br />Use either your Left (cyan) or Right (amber) hand to pass the needle. Keep your other hand visible in camera view.</li>
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>2. Grab the Needle</strong><br />Move one open tip ring into the top circle until it turns green, then pinch.</li>
      <li className="rounded-lg bg-slate-100 p-3 text-slate-900"><strong>3. Rings 1 → 2 → 3 → Release</strong><br />Pass left Ring 1, rotate through center Ring 2, exit right Ring 3, and open inside the top-right Release Ring.</li>
    </ol>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
        <input
          type="checkbox"
          data-testid="single-hand-mode"
          checked={singleHand}
          onChange={event => toggleSingleHandMode(event.target.checked)}
          className="mt-1"
        />
        <span>
          <strong>1-Hand Mode</strong> — only requires <strong>one hand</strong> in camera view (Left or Right) and hides the unused second instrument.
        </span>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
        <input
          type="checkbox"
          checked={fixtureId ? true : assisted}
          disabled={Boolean(fixtureId)}
          onChange={event => {
            const enabled = event.target.checked;
            setAssisted(enabled);
            setSample(null);
            setUiTick(value => value + 1);
          }}
          className="mt-1"
        />
        <span>
          <strong>Easy pickup</strong> — keeps the tips at the needle’s depth and snaps it into the jaws. Turning this off enables free 3D depth and resets the needle.
        </span>
      </label>
    </div>
    <p data-testid="simulation-status" aria-live="polite">{status === "error" ? "3D rendering unavailable" : status === "lost" ? "Simulation paused: 3D context lost" : status === "loading" ? "Loading 3D workspace" : snapshot?.reason ?? "Calibrate both hands to begin."}</p>
    <div className="relative h-[420px] overflow-hidden rounded-lg bg-slate-950">
      <div aria-label="Scene checkpoint map" className="pointer-events-none absolute inset-x-3 top-2.5 z-10 flex flex-wrap items-center justify-between gap-1.5 rounded-md bg-slate-900/85 px-3 py-1.5 text-[11px] text-slate-200 backdrop-blur-sm">
        <span className={exerciseSnapshot.activeTargetId === "practice-needle" ? "font-bold text-emerald-400" : "text-slate-300"}>① Top Circle: Pick Up Needle (Pinch)</span>
        <span>→</span>
        <span className={exerciseSnapshot.activeTargetId === "ring-1" ? "font-bold text-sky-400" : exerciseSnapshot.completedTargetIds.includes("ring-1") ? "text-emerald-400" : "text-slate-300"}>② Left Ring 1: Enter</span>
        <span>→</span>
        <span className={exerciseSnapshot.activeTargetId === "ring-2" ? "font-bold text-sky-400" : exerciseSnapshot.completedTargetIds.includes("ring-2") ? "text-emerald-400" : "text-slate-300"}>③ Center Ring 2: Rotate Wrist</span>
        <span>→</span>
        <span className={exerciseSnapshot.activeTargetId === "ring-3" ? "font-bold text-sky-400" : exerciseSnapshot.completedTargetIds.includes("ring-3") ? "text-emerald-400" : "text-slate-300"}>④ Right Ring 3: Exit</span>
        <span>→</span>
        <span className={exerciseSnapshot.activeTargetId === "release-zone" ? "font-bold text-sky-400" : exerciseSnapshot.phase === "complete" ? "text-emerald-400" : "text-slate-300"}>⑤ Top-Right Ring: Release (Open)</span>
      </div>
      <SceneBoundary key={generation} onFailure={onFailure}>
        <TrainingScene controlsRef={controlsRef} controller={controller} exercise={exercise} ghost={ghost} diagnosticsRef={diagnosticsRef} onStatus={onStatus} runtime={runtime} />
      </SceneBoundary>
    </div>
    <div aria-label="Exercise progression" className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="exercise-phase" className="font-medium">Phase: {exerciseSnapshot.phase}</p>
        <p data-testid="exercise-segment">Segment: {exerciseSnapshot.segmentId} — {exerciseSnapshot.segmentTitle} ({Math.round(exerciseSnapshot.overallProgress * 100)}%)</p>
      </div>
      <progress data-testid="exercise-progress" aria-label="Exercise progress" value={exerciseSnapshot.overallProgress} max={1} className="w-full" />
      <p data-testid="exercise-instruction" aria-live="polite" className="font-medium">{exerciseSnapshot.message}</p>
      {ghostSnapshot.visible && (
        <p data-testid="ghost-action-banner" className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          Ghost coach ({ghostSnapshot.syncMode === "progress-coupled" ? "Step-by-step" : "Full loop"}): {ghostSnapshot.actionLabel}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span data-testid="exercise-ghost-status">
          Ghost: {exerciseSnapshot.mode === "assessment" ? "disabled in assessment" : exerciseSnapshot.modeHooks.ghostVisible ? (exerciseSnapshot.modeHooks.ghostAutoTriggered ? "visible (auto-assist)" : "visible") : "hidden"}
        </span>
        <span data-testid="ghost-playback-summary">
          {exerciseSnapshot.mode === "assessment"
            ? "Playback: off"
            : `Playback: ${ghostSnapshot.speed}x · ${ghostSnapshot.syncMode} (${Math.round(ghostSnapshot.normalizedProgress * 100)}%)`}
        </span>
        <span data-testid="exercise-danger-status" className={exerciseSnapshot.inDangerZone ? "font-semibold text-red-600" : ""}>
          Safety: {exerciseSnapshot.inDangerZone ? "Warning — inside tissue-wall danger zone" : `Clear (violations: ${exerciseSnapshot.dangerZoneCount})`}
        </span>
      </div>
      <ol aria-label="Exercise segments" className="grid grid-cols-4 gap-1.5 text-xs sm:grid-cols-8">
        {skill.segments.map((segment, index) => {
          const completed = exerciseSnapshot.phase === "complete" || index < exerciseSnapshot.segmentIndex;
          const current = exerciseSnapshot.phase === "active" && index === exerciseSnapshot.segmentIndex;
          return (
            <li
              key={segment.id}
              data-testid={`segment-${segment.id}`}
              className={`rounded border px-2 py-1 text-center ${completed ? "border-emerald-600 bg-emerald-50 text-emerald-950" : current ? "border-sky-500 bg-sky-50 font-semibold text-sky-950" : "border-slate-200 text-slate-500"}`}
            >
              {segment.title}
            </li>
          );
        })}
      </ol>
    </div>
    {runtime.error && <div role="alert" className="rounded-lg border border-amber-500 p-3">
      <p>{runtime.error}</p><button type="button" onClick={reset} className="mt-2 rounded border px-3 py-1">Restart attempt</button>
    </div>}
    {runtime.message && mode !== "assessment" && <p role="status" data-testid="live-coaching" className="rounded-lg border border-sky-400 p-3">{runtime.message}</p>}
    {activeEvaluationBundle && review && (
      <AttemptResultsPanel
        bundle={activeEvaluationBundle}
        review={review}
        onTryAgain={reset}
        onReviewMoment={runtime.lastReplay ? marker => openReplay(marker) : undefined}
        saveStatus={runtime.saveStatus}
      />
    )}
    <p data-testid="pickup-guidance" aria-live="polite" className={`rounded-lg border p-3 font-medium ${feedback?.ready ? "border-green-500 bg-green-50 text-green-950" : "border-slate-300"}`}>{feedback?.message ?? "Calibrate both hands to begin."}</p>
    <p data-testid="needle-ownership">Needle: {snapshot?.object.heldBy ?? "free"}</p>
    <p className="text-sm text-zinc-500">Only one hand needs to hold and pass the needle (Left cyan or Right amber). Keep your unused hand comfortably visible in the camera frame so tracking stays active.</p>
    {debug && <div aria-label="Simulation diagnostics" className="space-y-2 break-all font-mono text-xs">
      <p>Render FPS: {sample?.fps ?? 0} | Frames: {sample?.frames ?? 0} | Source: {snapshot?.sourceTMs ?? "none"}</p>
      <p>Median render FPS: {timing.medianFps.toFixed(1)} | p95 frame: {timing.p95FrameMs.toFixed(1)} ms | Samples: {timing.sampleCount}</p>
      {(["left", "right"] as const).map(slot => <p key={slot} data-testid={`${slot}-instrument-state`}>{slot}: {JSON.stringify({ sourceTMs: snapshot?.sourceTMs ?? null, tool: snapshot?.[slot] ?? null, rendered: sample?.rendered[slot] ?? null })}</p>)}
      <p data-testid="needle-state">{JSON.stringify({ object: snapshot?.object ?? null, rendered: sample?.rendered.object ?? null })}</p>
      <p data-testid="exercise-state">{JSON.stringify(exerciseSnapshot)}</p>
      <p data-testid="ghost-state">{JSON.stringify(ghostSnapshot)}</p>
      {activeEvaluationBundle && (
        <p data-testid="evaluation-result-json">{JSON.stringify(activeEvaluationBundle.attemptResult)}</p>
      )}
    </div>}
  </section>;
}
