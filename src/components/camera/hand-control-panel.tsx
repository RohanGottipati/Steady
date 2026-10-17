"use client";

import { useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { HAND_SLOTS, WORKSPACE_DIRECTIONS, type CalibrationState } from "@/lib/vision/control-types";
import { quaternion } from "@/lib/vision/hand-geometry";
import type { useHandControls } from "@/lib/vision/use-hand-controls";

export function WorkspaceGuide({ calibration }: { calibration: CalibrationState }) {
  if (!calibration.workspace || (calibration.stage !== "workspace" && calibration.retryStage !== "workspace")) return null;
  const arrows = { left: "←", right: "→", up: "↑", down: "↓" };
  return <section className="space-y-3 rounded-lg border border-blue-400 bg-blue-50 p-4 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100" aria-label="Workspace movement guide">
    <h2 className="font-semibold">Move one open hand at a time</h2>
    <p>Keep palms facing the camera. Follow the arrows in the mirrored preview: move a little, then hold briefly. Keep the other hand relaxed and visible. Checked arrows stay saved.</p>
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
    <div className="flex flex-wrap gap-3">
      <button className="rounded-md border px-4 py-2 disabled:opacity-50" disabled={!running || collecting} onClick={calibrate}>
        {stage === "ready" ? "Recalibrate controls" : stage === "error" ? ui.calibration.retryStage === "workspace" ? "Retry workspace" : "Retry calibration" : "Calibrate controls"}
      </button>
      {collecting && <button className="rounded-md border px-4 py-2" onClick={cancel}>Cancel calibration</button>}
      {stage === "error" && ui.calibration.retryStage === "workspace" && <button className="rounded-md border px-4 py-2" onClick={cancel}>Start calibration over</button>}
    </div>
    <p data-testid="calibration-status" aria-live="polite">Calibration: {stage} — {ui.calibration.message}</p>
    {collecting && <progress className="w-full" aria-label="Calibration stage progress" value={ui.calibration.progress} max={1} />}
    <canvas ref={canvasRef} width={720} height={360} hidden={!ui.snapshot.calibrated} className="w-full rounded bg-zinc-950" aria-label="Hand position preview. Right is right, up is up, and circle size shows depth." />
    {ui.snapshot.calibrated && <p className="text-sm">The circle is your hand. A thicker stroke means the grip is closed. A faded circle keeps the last pose if tracking drops.</p>}
    <p data-testid="control-readiness">{ui.snapshot.canProgress ? "Controls ready" : "Tracking paused until both hands are in view."}</p>
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
  </section>;
}
