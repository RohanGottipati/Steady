"use client";

import { useEffect, useRef, useState } from "react";
import { HandControlPanel, WorkspaceGuide } from "@/components/camera/hand-control-panel";
import { CameraPreviewFrame } from "@/components/camera/camera-preview-frame";
import { defaultFixtureForSkill, fixtureMatchesSkill, resolveFixtureIdFromSearch, type FixtureId } from "@/lib/exercise/fixture-playback";
import { isDebugEnabled } from "@/lib/ui/debug-query";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import { HAND_CONNECTIONS, previewPoint } from "@/lib/vision/preview-coordinates";
import type { TrackingDiagnostics } from "@/lib/vision/types";
import { useHandControls } from "@/lib/vision/use-hand-controls";
import { useHandTracking } from "@/lib/vision/use-hand-tracking";
import type { SkillDefinition, TrainingMode } from "@/types";
import { retryUnsyncedAttempts } from "@/lib/storage/cloud-sync";
import { DegradedNotice } from "./degraded-notice";
import { ThreeDTrainingPreview } from "./3d-training-preview";
import { ModeSelector } from "./mode-selector";
import { SessionBoundary } from "./session-boundary";
import { useSessionResilience } from "./use-session-resilience";

export function TrainingSession(props: {
  skill: SkillCatalogEntry;
  definition: SkillDefinition;
}) {
  return (
    <SessionBoundary>
      <TrainingSessionView {...props} />
    </SessionBoundary>
  );
}

function TrainingSessionView({
  skill,
  definition,
}: {
  skill: SkillCatalogEntry;
  definition: SkillDefinition;
}) {
  const tracking = useHandTracking();
  const { videoRef, snapshotRef, diagnosticsRef, state, start, stop } = tracking;
  const controls = useHandControls(tracking);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef(stop);
  useEffect(() => { stopRef.current = stop; }, [stop]);
  const [mode, setMode] = useState<TrainingMode>(skill.availableModes[0] ?? "learn");
  const [fixtureId, setFixtureId] = useState<FixtureId | null>(null);
  const [debug, setDebug] = useState(false);
  const resilience = useSessionResilience();
  const debugRef = useRef(false);
  const [hud, setHud] = useState<TrackingDiagnostics & { left: string; right: string }>({
    backend: "none",
    trackingFps: 0,
    inferenceMs: 0,
    processedFrames: 0,
    left: "missing",
    right: "missing",
  });

  useEffect(() => {
    const selected = new URLSearchParams(location.search).get("fixture");
    if (fixtureId || (selected && selected !== "off")) return;
    void retryUnsyncedAttempts().catch(() => {});
  }, [fixtureId]);

  useEffect(() => {
    const debugEnabled = isDebugEnabled(location.search);
    debugRef.current = debugEnabled;
    const resolvedFixture = resolveFixtureIdFromSearch(location.search);
    const initTimer = setTimeout(() => {
      setDebug(debugEnabled);
      if (resolvedFixture && fixtureMatchesSkill(definition.id, resolvedFixture)) {
        setFixtureId(resolvedFixture);
      }
    }, 0);

    const restoreQuery = () => {
      const restored = resolveFixtureIdFromSearch(location.search);
      setFixtureId(fixtureMatchesSkill(definition.id, restored) ? restored : null);
      debugRef.current = isDebugEnabled(location.search);
      setDebug(debugRef.current);
      stopRef.current();
    };
    window.addEventListener("popstate", restoreQuery);
    let animation = 0;
    const draw = () => {
      animation = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      if (!debugRef.current) return;
      for (const hand of [snapshotRef.current.left, snapshotRef.current.right]) {
        if (!hand || performance.now() - snapshotRef.current.tMs > 500) continue;
        const points = hand.landmarks.map(p => previewPoint(p.x, p.y, width, height));
        context.strokeStyle = context.fillStyle =
          hand.handedness === "Left" ? "#22d3ee" : "#fbbf24";
        context.lineWidth = Math.max(2, width / 400);
        for (const [from, to] of HAND_CONNECTIONS) {
          context.beginPath();
          context.moveTo(points[from].x, points[from].y);
          context.lineTo(points[to].x, points[to].y);
          context.stroke();
        }
        for (const point of points) {
          context.beginPath();
          context.arc(point.x, point.y, width / 250, 0, Math.PI * 2);
          context.fill();
        }
        context.font = `${Math.max(16, width / 50)}px sans-serif`;
        context.fillText(`${hand.handedness} hand`, points[0].x + 10, points[0].y - 10);
      }
    };
    draw();

    const interval = setInterval(() => {
      if (!debugRef.current) return;
      const snapshot = snapshotRef.current;
      const fresh = performance.now() - snapshot.tMs <= 500;
      setHud({
        ...diagnosticsRef.current,
        left:
          fresh && snapshot.left
            ? `${Math.round(snapshot.left.handednessConfidence * 100)}%`
            : "missing",
        right:
          fresh && snapshot.right
            ? `${Math.round(snapshot.right.handednessConfidence * 100)}%`
            : "missing",
      });
    }, 250);

    return () => {
      window.removeEventListener("popstate", restoreQuery);
      clearTimeout(initTimer);
      cancelAnimationFrame(animation);
      clearInterval(interval);
    };
  }, [definition.id, diagnosticsRef, snapshotRef, videoRef]);

  const active = state.status === "running" || state.status === "paused";

  const selectFixture = (next: FixtureId | null) => {
    const allowed = next && fixtureMatchesSkill(definition.id, next) ? next : null;
    stop();
    const url = new URL(location.href);
    if (allowed) url.searchParams.set("fixture", allowed);
    else url.searchParams.set("fixture", "off");
    history.replaceState(null, "", url);
    setFixtureId(allowed);
  };

  const handleToggleFixtureMode = () => selectFixture(fixtureId ? null : defaultFixtureForSkill(definition.id));
  const handleStartCamera = () => {
    if (fixtureId) selectFixture(null);
    void Promise.resolve(start()).catch(() => {});
  };

  return (
    <div className="mt-8 space-y-6" data-testid="training-session">
      <DegradedNotice message={resilience.message} onDismiss={resilience.dismiss} />
      <section aria-label="Choose a training mode">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Choose a mode
        </h2>
        <ModeSelector modes={skill.availableModes} value={mode} onSelect={setMode} />
      </section>

      <section
        aria-label="Camera and calibration"
        className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
              disabled={active || state.status === "starting"}
              onClick={handleStartCamera}
            >
              {state.status === "error" ? "Retry camera" : "Start camera"}
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              disabled={!active && state.status !== "starting"}
              onClick={stop}
            >
              Stop camera
            </button>
            <button
              type="button"
              data-testid="toggle-fixture-mode"
              onClick={handleToggleFixtureMode}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                fixtureId
                  ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                  : "border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              {fixtureId ? "Use the camera" : "Play a sample pass"}
            </button>
          </div>
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {fixtureId ? (
              <>
                Playing a sample pass. No camera needed.
                <span className="sr-only"> Status: fixture ({fixtureId})</span>
              </>
            ) : (
              `Status: ${state.status}${state.message ? ` — ${state.message}` : ""}`
            )}
          </p>
        </div>

        <div hidden={Boolean(fixtureId)}><WorkspaceGuide calibration={controls.ui.calibration} /></div>

        <div className="grid gap-4 lg:grid-cols-2" hidden={Boolean(fixtureId)}>
          <div className="space-y-2">
            <CameraPreviewFrame active={active}>
              <video
                ref={videoRef}
                muted
                playsInline
                className="block aspect-video w-full -scale-x-100 object-contain"
                aria-label="Mirrored webcam preview"
              />
              <canvas
                ref={canvasRef}
                hidden={!debug}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                aria-hidden="true"
              />
            </CameraPreviewFrame>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Raw webcam video stays in your browser and is never uploaded.
              {debug ? " Cyan marks the left hand and amber marks the right." : ""}
            </p>
          </div>

          <HandControlPanel
            controls={controls}
            running={state.status === "running"}
            debug={debug}
          />
        </div>
      </section>

      <ThreeDTrainingPreview
        controlsRef={controls.snapshotRef}
        calibrated={controls.ui.snapshot.calibrated || Boolean(fixtureId)}
        debug={debug}
        skill={definition}
        mode={mode}
        onModeChange={setMode}
        singleHand={controls.singleHand}
        onQuickSingleHand={controls.quickCalibrate}
        onSingleHandChange={controls.setSingleHand}
        fixtureId={fixtureId}
        onFixtureChange={selectFixture}
      />

      {debug && (
        <dl
          aria-label="Tracking diagnostics"
          className="grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-sm"
        >
          <dt>Backend</dt>
          <dd>{hud.backend}</dd>
          {hud.fallbackReason && (
            <>
              <dt>Fallback reason</dt>
              <dd>{hud.fallbackReason}</dd>
            </>
          )}
          <dt>Tracking FPS</dt>
          <dd>{hud.trackingFps}</dd>
          <dt>Inference time</dt>
          <dd>{hud.inferenceMs.toFixed(1)} ms</dd>
          <dt>Processed frames</dt>
          <dd>{hud.processedFrames}</dd>
          <dt>Left handedness confidence</dt>
          <dd>{hud.left}</dd>
          <dt>Right handedness confidence</dt>
          <dd>{hud.right}</dd>
        </dl>
      )}
    </div>
  );
}
