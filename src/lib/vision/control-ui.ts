import type { CalibrationState, ControlSnapshot, HandControl, ToolControlTarget } from "./control-types";

/** Control fields the React HUD actually reads. Landmark arrays stay on the ref. */
export interface ControlUiHand {
  status: HandControl["status"];
  rotationHeld: boolean;
  target: ToolControlTarget | null;
  pinchRatio: number | null;
}

export interface ControlUiSnapshot {
  calibrated: boolean;
  canProgress: boolean;
  left: ControlUiHand;
  right: ControlUiHand;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

function projectHand(hand: HandControl): ControlUiHand {
  return {
    status: hand.status,
    rotationHeld: hand.rotationHeld,
    target: hand.target
      ? {
          id: hand.target.id,
          position: { ...hand.target.position },
          rotation: { ...hand.target.rotation },
          jawClosed: hand.target.jawClosed,
        }
      : null,
    pinchRatio: typeof hand.hand?.pinchRatio === "number" ? hand.hand.pinchRatio : null,
  };
}

export function projectControlUi(snapshot: ControlSnapshot): ControlUiSnapshot {
  return {
    calibrated: snapshot.calibrated,
    canProgress: snapshot.canProgress,
    left: projectHand(snapshot.left),
    right: projectHand(snapshot.right),
  };
}

export function controlUiKey(snapshot: ControlUiSnapshot): string {
  const hand = (value: ControlUiHand) => ({
    status: value.status,
    rotationHeld: value.rotationHeld,
    pinchRatio: value.pinchRatio === null ? null : round3(value.pinchRatio),
    target: value.target
      ? {
          id: value.target.id,
          jawClosed: value.target.jawClosed,
          x: round3(value.target.position.x),
          y: round3(value.target.position.y),
          z: round3(value.target.position.z),
          rx: round3(value.target.rotation.x),
          ry: round3(value.target.rotation.y),
          rz: round3(value.target.rotation.z),
          rw: round3(value.target.rotation.w),
        }
      : null,
  });
  return JSON.stringify({
    calibrated: snapshot.calibrated,
    canProgress: snapshot.canProgress,
    left: hand(snapshot.left),
    right: hand(snapshot.right),
  });
}

export function calibrationUiKey(state: CalibrationState): string {
  return JSON.stringify({
    stage: state.stage,
    progress: Math.round(state.progress * 100),
    message: state.message,
    retryStage: state.retryStage ?? null,
    secondsRemaining: state.secondsRemaining ?? null,
    workspace: state.workspace ?? null,
    neutralHands: state.neutralHands ?? null,
  });
}
