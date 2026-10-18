"use client";

import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { HAND_SLOTS, USE_SURGICAL_POSTURE_MAPPING, WORKSPACE_DIRECTIONS, type CalibrationState } from "@/lib/vision/control-types";
import { quaternion } from "@/lib/vision/hand-geometry";
import type { useHandControls } from "@/lib/vision/use-hand-controls";

export function WorkspaceGuide({ calibration }: { calibration: CalibrationState }) {
  if (!calibration.workspace || (calibration.stage !== "workspace" && calibration.retryStage !== "workspace")) return null;
  const arrows = { left: "←", right: "→", up: "↑", down: "↓" };
  return <section className="space-y-3 rounded-lg border border-blue-400 bg-blue-50 p-4 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100" aria-label="Workspace movement guide">
    <h2 className="font-semibold">Move one relaxed hand at a time</h2>
    <p>{USE_SURGICAL_POSTURE_MAPPING ? "Keep palms mostly downward and slightly inward above your desk, with thumb and index apart." : "Keep palms facing the camera."} Follow the arrows in the mirrored preview: move a little, then hold briefly. Keep the other hand relaxed and visible. Checked arrows stay saved.</p>
    <p className="font-medium" aria-live="polite">{calibration.message}</p>
    {HAND_SLOTS.map(slot => <div key={slot} role="group" aria-label={`${slot} hand workspace`}>
      <p className="mb-1 font-medium capitalize">{slot} hand</p>
      <ul className="grid grid-cols-4 gap-2">
        {WORKSPACE_DIRECTIONS.map(direction => {
          const progress = calibration.workspace![slot][direction], done = progress === 1;
          return <li key={direction} aria-label={`${direction}: ${done ? "captured" : "pending"}`} className={`rounded border p-2 text-center ${done ? "border-green-600 bg-green-100 text-green-950" : "border-zinc-400"}`}>
            <span className="block text-2xl" aria-hidden="true">{done ? "✓" : arrows[direction]}</span>
            <span className="capitalize">{direction}</span><span className="block text-xs">{done ? "Captured" : progress > 0 ? "Hold briefly" : "Move here"}</span>
          </li>;
        })}
      </ul>
    </div>)}
    {calibration.secondsRemaining !== undefined && <p className="text-sm">{calibration.secondsRemaining} seconds remaining</p>}
  </section>;
}

function SurgicalPostureGuide() {
  return <figure className="rounded-lg bg-slate-100 p-3 text-slate-800" aria-label="Natural operating posture, side view">
    <svg viewBox="0 0 360 100" className="h-24 w-full" role="img" aria-label="Relaxed forearm and palm-down hand above a desk in front of a laptop">
      <path d="M20 87H340M290 82L273 20H281L298 82H335" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="279" cy="24" r="3" fill="currentColor" />
      <path d="M279 29L194 58" fill="none" stroke="#64748b" strokeDasharray="4 4" />
      <path d="M35 38Q63 45 98 60L161 60Q174 58 188 61L202 65Q205 69 199 70L164 68L101 70Q79 70 57 61" fill="none" stroke="#0891b2" strokeWidth="5" strokeLinecap="round" />
      <path d="M180 74V82M176 78L180 82L184 78" fill="none" stroke="#0891b2" strokeWidth="2" />
      <text x="35" y="23" fontSize="12">Relaxed wrist</text><text x="160" y="46" fontSize="12">Palm down</text><text x="285" y="14" fontSize="11">Webcam</text><text x="26" y="99" fontSize="11">Desk / operating table</text>
    </svg>
    <figcaption className="text-sm">Place your hands naturally above your desk as if holding instruments. Keep palms mostly downward and slightly inward; fingers can stay curved.</figcaption>
  </figure>;
}

function OrientationDebug({ controls }: { controls: ReturnType<typeof useHandControls> }) {
  const [sample, setSample] = useState(() => ({ diagnostics: controls.diagnosticsRef.current, snapshot: controls.snapshotRef.current }));
  useEffect(() => {
    const timer = setInterval(() => setSample({ diagnostics: controls.diagnosticsRef.current ? { ...controls.diagnosticsRef.current } : null, snapshot: controls.snapshotRef.current }), 250);
    return () => clearInterval(timer);
  }, [controls.diagnosticsRef, controls.snapshotRef]);
  const point = (value: { x: number; y: number; z: number } | null | undefined) => value ? `${value.x.toFixed(3)}, ${value.y.toFixed(3)}, ${value.z.toFixed(3)}` : "unavailable";
  const degrees = (value: number | undefined) => value === undefined ? "—" : `${Math.round(value * 180 / Math.PI)}°`;
  return <div className="grid gap-3 font-mono text-xs" aria-label="Surgical orientation diagnostics">
    {HAND_SLOTS.map(slot => {
      const hand = sample.snapshot[slot], info = sample.diagnostics?.[slot], target = hand.target;
      return <section key={slot} aria-label={`${slot} orientation diagnostics`} className="rounded border p-2">
        <p>{slot.toUpperCase()} | tracked: {hand.status === "tracking" ? "yes" : "no"} ({hand.status})</p>
        <p>assigned hand: {info?.handedness ?? "—"} | handedness confidence: {info?.confidence?.toFixed(3) ?? "—"}</p>
        <p>calibrated: {sample.snapshot.calibrated && info?.calibrated ? "yes" : "no"} | pinch: {hand.hand?.pinchRatio.toFixed(3) ?? "unavailable"} | state: {target ? target.jawClosed ? "CLOSED" : "OPEN" : "—"}</p>
        <p>palm normal: {point(info?.palmNormal)}</p>
        <p>relative pitch: {degrees(info?.relativeAngles?.x)} | yaw: {degrees(info?.relativeAngles?.z)} | roll: {degrees(info?.relativeAngles?.y)}</p>
        <p>target position: {point(target?.position)}</p>
        <p>target quaternion (xyzw): {target ? `${point(target.rotation)}, ${target.rotation.w.toFixed(3)}` : "unavailable"}</p>
      </section>;
    })}
  </div>;
}

export function HandControlPanel({ controls, running, debug }: {
  controls: ReturnType<typeof useHandControls>; running: boolean; debug: boolean;
}) {
  const { snapshotRef, ui, calibrate, cancel, setPlanar } = controls;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [planar, setPlanarUi] = useState(false);
  const stage = ui.calibration.stage;
  const collecting = stage === "neutral" || stage === "pinch" || stage === "workspace";

  useEffect(() => {
    let animation = 0;
    const draw = () => {
      animation = requestAnimationFrame(draw);
      const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const width = canvas.width, height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "#52525b"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
      for (const slot of HAND_SLOTS) {
        const hand = snapshotRef.current[slot], target = hand.target;
        if (!target) continue;
        const x = width / 2 + target.position.x * width / 3;
        const y = height / 2 - target.position.y * height / 2;
        const axis = new Vector3(0, 1, 0).applyQuaternion(quaternion(target.rotation));
        ctx.globalAlpha = hand.status === "tracking" ? 1 : 0.35;
        ctx.strokeStyle = ctx.fillStyle = slot === "left" ? "#22d3ee" : "#fbbf24";
        ctx.lineWidth = target.jawClosed ? 5 : 2;
        ctx.beginPath(); ctx.arc(x, y, 12 + (target.position.z / 0.15) * 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + axis.x * 35, y - axis.y * 35); ctx.stroke();
        ctx.font = "14px sans-serif"; ctx.fillText(`${slot} ${target.jawClosed ? "closed" : "open"}`, x + 16, y);
      }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, [snapshotRef]);

  return <section className="space-y-3 rounded-lg border p-4" aria-label="Calibrated hand controls">
    <h2 className="text-lg font-semibold">Calibrated controls</h2>
    {USE_SURGICAL_POSTURE_MAPPING && (stage === "idle" || stage === "error") && <SurgicalPostureGuide />}
    <div className="flex flex-wrap gap-3">
      <button className="rounded-md border px-4 py-2 disabled:opacity-50" disabled={!running || collecting} onClick={calibrate}>
        {stage === "ready" ? "Recalibrate controls" : stage === "error" ? ui.calibration.retryStage === "workspace" ? "Retry workspace" : "Retry calibration" : "Calibrate controls"}
      </button>
      {collecting && <button className="rounded-md border px-4 py-2" onClick={cancel}>Cancel calibration</button>}
      {stage === "error" && ui.calibration.retryStage === "workspace" && <button className="rounded-md border px-4 py-2" onClick={cancel}>Start calibration over</button>}
    </div>
    <p data-testid="calibration-status" aria-live="polite">Calibration: {stage} — {ui.calibration.message}</p>
    {collecting && <progress className="w-full" aria-label="Calibration stage progress" value={ui.calibration.progress} max={1} />}
    {ui.calibration.neutralHands && stage === "neutral" && HAND_SLOTS.map(slot => <p key={slot} className="text-sm" aria-label={`${slot} neutral capture`}>{slot === "left" ? "Left" : "Right"} hand: {ui.calibration.neutralHands![slot] === 1 ? "calibrated" : "hold steady"} ({Math.round(ui.calibration.neutralHands![slot] * 100)}%)</p>)}
    <canvas ref={canvasRef} width={720} height={360} hidden={!ui.snapshot.calibrated} className="w-full rounded bg-zinc-950" aria-label="Hand position preview. Right is right, up is up, and circle size shows depth." />
    {ui.snapshot.calibrated && <p className="text-sm">The circle is your hand. A thicker stroke means the grip is closed. A faded circle keeps the last pose if tracking drops.</p>}
    <p data-testid="control-readiness">{ui.snapshot.canProgress ? "Controls ready" : controls.singleHand ? "Tracking paused until your active hand is ready." : "Tracking paused until both hands are in view."}</p>
    {HAND_SLOTS.map(slot => {
      const hand = ui.snapshot[slot], target = hand.target, calibration = ui.profile?.[slot];
      const grip = target ? `, grip ${target.jawClosed ? "closed" : "open"}` : "";
      const plainStatus = hand.status === "tracking" ? "in view" : hand.status === "lost" ? "out of view" : hand.status === "recovering" || hand.status === "grace" ? "recovering" : "waiting";
      return <div key={slot} className="text-sm">
        <div role="group" aria-label={`${slot} control target`}>{debug
          ? <>{slot}: {hand.status}{target && ` | x ${target.position.x.toFixed(3)} y ${target.position.y.toFixed(3)} z ${target.position.z.toFixed(3)} | grip ${target.jawClosed ? "closed" : "open"}`}{hand.rotationHeld && " | rotation held"}</>
          : <>{slot} hand: {plainStatus}{grip}</>}</div>
        {debug && calibration && <p className="font-mono" aria-label={`${slot} pinch diagnostics`}>Pinch ratio: {hand.pinchRatio === null ? "missing" : hand.pinchRatio.toFixed(3)}; enter &lt; {calibration.enterPinchRatio.toFixed(3)}; release &gt; {calibration.releasePinchRatio.toFixed(3)}</p>}
      </div>;
    })}
    {debug && <label className="flex gap-2 text-sm"><input type="checkbox" checked={planar} onChange={event => { setPlanarUi(event.target.checked); setPlanar(event.target.checked); }} />Planar depth fallback (lock Z)</label>}
    {process.env.NODE_ENV === "development" && debug && <details className="relative">
      <summary className="cursor-pointer text-sm">Wrist orientation diagnostics</summary>
      <div className="absolute right-0 top-full z-10 mt-2 max-h-80 w-full min-w-72 overflow-auto rounded-lg border bg-white p-2 text-zinc-950 shadow-lg">
        <OrientationDebug controls={controls} />
      </div>
    </details>}
  </section>;
}
