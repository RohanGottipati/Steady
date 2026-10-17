"use client";

import { useEffect, useRef, useState } from "react";
import { TrackingController } from "./tracking-controller";
import { emptySnapshot, type TrackingDiagnostics, type TrackingState } from "./types";

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const snapshotRef = useRef(emptySnapshot());
  const diagnosticsRef = useRef<TrackingDiagnostics>({ backend: "none", trackingFps: 0, inferenceMs: 0, processedFrames: 0 });
  const controllerRef = useRef<TrackingController | null>(null);
  const [state, setState] = useState<TrackingState>({ status: "idle" });

  useEffect(() => {
    if (!videoRef.current) return;
    const controller = new TrackingController(videoRef.current, snapshotRef, diagnosticsRef, setState);
    controllerRef.current = controller;
    // Next's Activity cache may preserve React state while tearing down effects.
    // A resumed page has a new controller and must not retain a "running" UI.
    controller.stop();
    return () => { controllerRef.current = null; controller.stop(false); };
  }, []);

  return {
    videoRef, snapshotRef, diagnosticsRef, state,
    start: () => controllerRef.current?.start(),
    stop: () => controllerRef.current?.stop(),
  };
}
