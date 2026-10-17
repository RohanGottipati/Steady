"use client";

import { useEffect, useRef, useState } from "react";
import { HandControlsController } from "./hand-controls";
import { calibrationUiKey, controlUiKey, projectControlUi, type ControlUiSnapshot } from "./control-ui";
import { emptyControlSnapshot, type CalibrationProfile, type CalibrationState } from "./control-types";
import type { useHandTracking } from "./use-hand-tracking";
import type { TrackingStatus } from "./types";

/** Compose with ONE existing tracker; this hook never owns or stops its camera. */
export function useHandControls(tracking: ReturnType<typeof useHandTracking>) {
  const { videoRef, snapshotRef: rawRef, state } = tracking;
  const snapshotRef = useRef(emptyControlSnapshot());
  const controllerRef = useRef<HandControlsController | null>(null);
  const statusRef = useRef<TrackingStatus>("idle");
  const planarRef = useRef(false);
  const singleHandRef = useRef(false);
  const [singleHand, setSingleHandState] = useState(false);
  const [ui, setUi] = useState<{
    calibration: CalibrationState; profile: CalibrationProfile | null; snapshot: ControlUiSnapshot;
  }>({ calibration: { stage: "idle", progress: 0, message: "Start the camera, then calibrate controls." }, profile: null, snapshot: projectControlUi(emptyControlSnapshot()) });

  useEffect(() => {
    const controller = new HandControlsController();
    controller.setPlanar(planarRef.current);
    controller.setSingleHand(singleHandRef.current);
    controllerRef.current = controller;
    let animation = 0;
    let lastStream: HTMLVideoElement["srcObject"] = null;
    const frame = () => {
      const now = performance.now();
      const video = videoRef.current;
      if (video?.srcObject !== lastStream) {
        if (lastStream !== null) controller.reset("Camera changed. Recalibrate controls.");
        lastStream = video?.srcObject ?? null;
      }
      if (statusRef.current === "running" && !document.hidden && video?.srcObject) {
        controller.update(rawRef.current, now, { width: video.videoWidth, height: video.videoHeight });
      } else controller.suspend(now);
      snapshotRef.current = controller.snapshot;
      animation = requestAnimationFrame(frame);
    };
    const visibility = () => {
      if (document.hidden) { controller.suspend(performance.now()); snapshotRef.current = controller.snapshot; }
    };
    document.addEventListener("visibilitychange", visibility);
    animation = requestAnimationFrame(frame);
    const sample = () => {
      const snapshot = projectControlUi(controller.snapshot);
      const calibration = { ...controller.calibration.state };
      const profile = controller.calibration.profile;
      setUi(current => {
        if (current.profile === profile && controlUiKey(current.snapshot) === controlUiKey(snapshot) && calibrationUiKey(current.calibration) === calibrationUiKey(calibration)) {
          return current;
        }
        return { calibration, profile, snapshot };
      });
    };
    const initial = setTimeout(sample, 0);
    const interval = setInterval(sample, 250);
    return () => {
      clearTimeout(initial); clearInterval(interval); cancelAnimationFrame(animation);
      document.removeEventListener("visibilitychange", visibility);
      controller.reset(); controllerRef.current = null; snapshotRef.current = emptyControlSnapshot();
    };
  }, [videoRef, rawRef]);

  useEffect(() => {
    statusRef.current = state.status;
    const controller = controllerRef.current;
    if (!controller) return;
    if (state.status === "idle" || state.status === "error") controller.reset();
    else if (state.status !== "running") controller.suspend(performance.now());
    snapshotRef.current = controller.snapshot;
  }, [state.status]);

  const calibrate = () => {
    const video = videoRef.current, controller = controllerRef.current;
    if (!video?.srcObject || !controller || statusRef.current !== "running" || document.hidden) return;
    controller.beginCalibration(performance.now(), { width: video.videoWidth, height: video.videoHeight });
    snapshotRef.current = controller.snapshot;
    setUi({ calibration: { ...controller.calibration.state }, profile: null, snapshot: projectControlUi(controller.snapshot) });
  };
  const cancel = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.reset("Calibration cancelled. Calibrate controls when ready.");
    snapshotRef.current = controller.snapshot;
    setUi({ calibration: { ...controller.calibration.state }, profile: null, snapshot: projectControlUi(controller.snapshot) });
  };
  const quickCalibrate = () => {
    const video = videoRef.current, controller = controllerRef.current;
    if (!controller) return;
    singleHandRef.current = true;
    setSingleHandState(true);
    controller.quickCalibrate({ width: video?.videoWidth || 1280, height: video?.videoHeight || 720 });
    snapshotRef.current = controller.snapshot;
    setUi({ calibration: { ...controller.calibration.state }, profile: controller.calibration.profile, snapshot: projectControlUi(controller.snapshot) });
  };
  const setSingleHand = (enabled: boolean) => {
    singleHandRef.current = enabled;
    setSingleHandState(enabled);
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setSingleHand(enabled);
    snapshotRef.current = controller.snapshot;
    setUi({ calibration: { ...controller.calibration.state }, profile: controller.calibration.profile, snapshot: projectControlUi(controller.snapshot) });
  };
  return { snapshotRef, ui, calibrate, cancel, quickCalibrate, singleHand, setSingleHand, setPlanar: (enabled: boolean) => {
    planarRef.current = enabled; controllerRef.current?.setPlanar(enabled);
  } };
}
