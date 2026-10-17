"use client";

import { useEffect, useRef, useState } from "react";
import { HAND_CONNECTIONS, previewPoint } from "@/lib/vision/preview-coordinates";
import { useHandTracking } from "@/lib/vision/use-hand-tracking";
import type { TrackingDiagnostics } from "@/lib/vision/types";

export function HandTrackingPreview() {
  const { videoRef, snapshotRef, diagnosticsRef, state, start, stop } = useHandTracking();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [debug, setDebug] = useState(false);
  const [hud, setHud] = useState<TrackingDiagnostics & { left: string; right: string }>({ backend: "none", trackingFps: 0, inferenceMs: 0, processedFrames: 0, left: "missing", right: "missing" });

  useEffect(() => {
    const debugEnabled = new URLSearchParams(location.search).get("debug") === "1" || process.env.NEXT_PUBLIC_DEBUG_DEFAULT === "true";
    // Initialize from the browser URL without depending on an SSR search hook.
    const initialize = setTimeout(() => setDebug(debugEnabled), 0);
    let animation: number;
    const draw = () => {
      animation = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      for (const hand of [snapshotRef.current.left, snapshotRef.current.right]) {
        if (!hand || performance.now() - snapshotRef.current.tMs > 500) continue;
        const points = hand.landmarks.map(p => previewPoint(p.x, p.y, width, height));
        context.strokeStyle = context.fillStyle = hand.handedness === "Left" ? "#22d3ee" : "#fbbf24";
        context.lineWidth = Math.max(2, width / 400);
        for (const [from, to] of HAND_CONNECTIONS) {
          context.beginPath(); context.moveTo(points[from].x, points[from].y); context.lineTo(points[to].x, points[to].y); context.stroke();
        }
        for (const point of points) { context.beginPath(); context.arc(point.x, point.y, width / 250, 0, Math.PI * 2); context.fill(); }
        context.font = `${Math.max(16, width / 50)}px sans-serif`;
        context.fillText(`${hand.handedness} hand`, points[0].x + 10, points[0].y - 10);
      }
    };
    draw();
    const interval = setInterval(() => {
      if (!debugEnabled) return;
      const snapshot = snapshotRef.current;
      const fresh = performance.now() - snapshot.tMs <= 500;
      setHud({ ...diagnosticsRef.current,
        left: fresh && snapshot.left ? `${Math.round(snapshot.left.handednessConfidence * 100)}%` : "missing",
        right: fresh && snapshot.right ? `${Math.round(snapshot.right.handednessConfidence * 100)}%` : "missing",
      });
    }, 250);
    return () => { clearTimeout(initialize); cancelAnimationFrame(animation); clearInterval(interval); };
  }, [videoRef, snapshotRef, diagnosticsRef]);

  const active = state.status === "running" || state.status === "paused";
  return (
    <section className="space-y-5" aria-label="Hand tracking preview">
      <div className="flex flex-wrap gap-3">
        <button className="rounded-md bg-zinc-950 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950" disabled={active || state.status === "starting"} onClick={() => void start()}>
          {state.status === "error" ? "Retry camera" : "Start camera"}
        </button>
        <button className="rounded-md border px-4 py-2 disabled:opacity-50" disabled={!active && state.status !== "starting"} onClick={stop}>Stop camera</button>
      </div>
      <p role="status" aria-live="polite">Status: {state.status}{state.message ? ` — ${state.message}` : ""}</p>
      <div className="relative overflow-hidden rounded-lg bg-zinc-950">
        <video ref={videoRef} muted playsInline className="block aspect-video w-full -scale-x-100 object-contain" aria-label="Mirrored webcam preview" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" aria-hidden="true" />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Video and hand landmarks are processed in this browser and are not uploaded or recorded. Stop releases the camera. Cyan: left hand. Amber: right hand.</p>
      {debug && <dl aria-label="Tracking diagnostics" className="grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-sm">
        <dt>Backend</dt><dd>{hud.backend}</dd>
        {hud.fallbackReason && <><dt>Fallback reason</dt><dd>{hud.fallbackReason}</dd></>}
        <dt>Tracking FPS</dt><dd>{hud.trackingFps}</dd>
        <dt>Inference time</dt><dd>{hud.inferenceMs.toFixed(1)} ms</dd>
        <dt>Processed frames</dt><dd>{hud.processedFrames}</dd>
        <dt>Left handedness confidence</dt><dd>{hud.left}</dd>
        <dt>Right handedness confidence</dt><dd>{hud.right}</dd>
      </dl>}
    </section>
  );
}
