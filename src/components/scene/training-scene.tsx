"use client";

import { configureRoomRenderer } from "@/lib/ui/room-renderer";
import { TrainingField, RoomCamera } from "./room-environment";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Group, Mesh, MeshBasicMaterial, OrthographicCamera } from "three";
import {
  composePose,
  interpolatePose,
  pickupFeedback,
  TIP_OFFSET,
  toolFromTarget,
  type Pose,
  type SimulationSnapshot,
  type ToolSimulationController,
} from "@/lib/simulation/tool-simulation";
import type {
  ExerciseController,
  ExerciseSnapshot,
} from "@/lib/exercise/exercise-controller";
import type {
  GhostPlaybackController,
  GhostSnapshot,
} from "@/lib/exercise/ghost-playback";
import type { ControlSnapshot } from "@/lib/vision/control-types";
import { ExerciseTargets, updateExerciseTargets } from "./exercise-targets";
import { GhostLayer, updateGhostLayer } from "./ghost-layer";
import { Instrument } from "./instrument";
import { OperatingRoom, PracticeNeedle, PracticePeg } from "./operating-room";
import {
  PegTransferTargets,
  updatePegTransferTargets,
} from "./peg-transfer-targets";
import type { TrainingRuntime } from "@/lib/exercise/training-runtime";
import { RenderTiming } from "@/lib/simulation/render-timing";
import { PickupHalo, TipCursor } from "./pickup-guides";
import { TrainingTarget } from "./targets/training-target";

export interface SceneDiagnostics {
  fps: number;
  frames: number;
  timing: RenderTiming;
  snapshot: SimulationSnapshot;
  exercise?: ExerciseSnapshot;
  ghost?: GhostSnapshot;
  rendered: { left: Pose | null; right: Pose | null; object: Pose | null };
}
export interface TrainingSceneProps {
  controlsRef: RefObject<ControlSnapshot>;
  runtime?: TrainingRuntime;
  active?: boolean;
  performanceMode?: boolean;
  onPerformanceFallback?: () => void;
  controller: ToolSimulationController;
  exercise?: ExerciseController;
  ghost?: GhostPlaybackController;
  diagnosticsRef: RefObject<SceneDiagnostics | null>;
  onStatus: (status: "ready" | "lost") => void;
  onLoadFailure?: () => void;
}
const poseOf = (group: Group): Pose => ({
  position: { x: group.position.x, y: group.position.y, z: group.position.z },
  rotation: {
    x: group.quaternion.x,
    y: group.quaternion.y,
    z: group.quaternion.z,
    w: group.quaternion.w,
  },
});
function apply(group: Group, pose: Pose) {
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.quaternion.set(
    pose.rotation.x,
    pose.rotation.y,
    pose.rotation.z,
    pose.rotation.w,
  );
}

export function SceneContent({
  controlsRef,
  controller,
  exercise,
  ghost,
  diagnosticsRef,
  onStatus,
  runtime,
  performanceMode = false,
}: TrainingSceneProps) {
  const left = useRef<Group>(null),
    right = useRef<Group>(null),
    needle = useRef<Group>(null),
    targets = useRef<Group>(null),
    ghostGroup = useRef<Group>(null);
  const leftCursor = useRef<Group>(null),
    rightCursor = useRef<Group>(null),
    halo = useRef<Group>(null);
  const initialized = useRef(false),
    interrupted = useRef(true),
    contextLost = useRef(false);
  const epoch = useRef(-1);
  const frames = useRef<number[]>([]),
    totalFrames = useRef(0);
  const timing = useRef(new RenderTiming());
  const { gl, camera, size } = useThree();
  useEffect(() => {
    const renderTiming = timing.current;
    // Activity can hide this effect while the context restores. Read actual GL
    // state on resume rather than retaining a missed context-event flag.
    contextLost.current = gl.getContext().isContextLost();
    interrupted.current = true;
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost.current = true;
      interrupted.current = true;
      renderTiming.clear();
      runtime?.suspend("Simulation paused: 3D context lost.");
      controller.suspend("Simulation paused: 3D context lost.");
      exercise?.suspend("Simulation paused: 3D context lost.");
      ghost?.suspend();
      onStatus("lost");
    };
    const restored = () => {
      contextLost.current = false;
      interrupted.current = true;
      onStatus("ready");
    };
    const visibility = () => {
      if (document.hidden) {
        interrupted.current = true;
        renderTiming.clear();
        runtime?.suspend("Simulation paused: tab hidden.");
        controller.suspend("Simulation paused: tab hidden.");
        exercise?.suspend("Simulation paused: tab hidden.");
        ghost?.suspend();
      }
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    document.addEventListener("visibilitychange", visibility);
    onStatus(contextLost.current ? "lost" : "ready");
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      document.removeEventListener("visibilitychange", visibility);
      if (runtime) runtime.suspend("Simulation paused: scene inactive.");
      else {
        controller.reset();
        exercise?.reset();
        ghost?.reset();
      }
      diagnosticsRef.current = null;
      initialized.current = false;
      interrupted.current = true;
      frames.current = [];
      totalFrames.current = 0;
      renderTiming.clear();
    };
  }, [
    camera,
    gl,
    controller,
    exercise,
    ghost,
    diagnosticsRef,
    onStatus,
    runtime,
  ]);

  useFrame((_, delta) => {
    const now = performance.now();
    if (contextLost.current || document.hidden) {
      interrupted.current = true;
      runtime?.suspend();
      controller.suspend();
      exercise?.suspend();
      ghost?.suspend();
      return;
    }
    if (epoch.current !== controller.epoch) {
      initialized.current = false;
      epoch.current = controller.epoch;
      timing.current.clear();
      if (!runtime) {
        exercise?.reset();
        ghost?.reset();
      }
    }
    if (runtime) runtime.advance(controlsRef.current, delta, now);
    else {
      const events = controller.update(controlsRef.current, now);
      if (controller.snapshot.object.heldBy === "right-tool")
        ghost?.setActiveSide("right");
      else if (controller.snapshot.object.heldBy === "left-tool")
        ghost?.setActiveSide("left");
      const currentExercise = exercise?.update(
        controlsRef.current,
        controller.snapshot,
        events,
        now,
      );
      ghost?.update(currentExercise ?? exercise?.snapshot ?? null, delta);
    }
    const exerciseSnapshot = exercise?.snapshot;
    const ghostSnapshot = ghost?.snapshot;
    const activeControls = runtime?.controls ?? controlsRef.current;
    const pegScene = exercise?.skill.id === "peg-transfer";
    if (pegScene)
      updatePegTransferTargets(targets.current, exerciseSnapshot ?? null);
    else updateExerciseTargets(targets.current, exerciseSnapshot ?? null);
    updateGhostLayer(
      ghostGroup.current,
      ghostSnapshot ?? null,
      ghost?.getTrailData(),
    );
    timing.current.record(now);
    const snapshot = controller.snapshot;
    const groups = { left: left.current, right: right.current };
    if (!snapshot.left || !snapshot.right) {
      initialized.current = false;
      for (const group of Object.values(groups))
        if (group) group.visible = false;
      if (needle.current) apply(needle.current, snapshot.object);
    } else if (snapshot.canProgress) {
      for (const slot of ["left", "right"] as const) {
        const group = groups[slot],
          tool = snapshot[slot];
        if (!group || !tool) continue;
        if (
          snapshot.singleHand &&
          activeControls[slot].status !== "tracking" &&
          snapshot.object.heldBy !== tool.id
        ) {
          group.visible = false;
          continue;
        }
        const displayed =
          initialized.current && group.visible
            ? interpolatePose(
                poseOf(group),
                tool,
                interrupted.current ? 0 : delta,
              )
            : tool;
        const nextPose = snapshot.assisted
          ? toolFromTarget({ ...tool, ...displayed }, tool.id, true)
          : displayed;
        // A rejected display projection must retain the last valid pose/jaws.
        // On first initialization keep the instrument hidden until it is usable.
        if (!nextPose) continue;
        group.visible = true;
        apply(group, nextPose);
        for (const [name, sign] of [
          ["jaw-left", -1],
          ["jaw-right", 1],
        ] as const) {
          const jaw = group.getObjectByName(name);
          if (jaw) {
            jaw.rotation.z = tool.jawClosed ? 0 : sign * -0.24;
            jaw.position.x = tool.jawClosed ? sign * 0.006 : 0;
          }
        }
      }
      if (needle.current) {
        const owner =
          snapshot.object.heldBy === "left-tool"
            ? left.current
            : snapshot.object.heldBy === "right-tool"
              ? right.current
              : null;
        const desired =
          owner && controller.attachment
            ? composePose(poseOf(owner), controller.attachment)
            : snapshot.object;
        apply(
          needle.current,
          initialized.current && !owner
            ? interpolatePose(
                poseOf(needle.current),
                desired,
                interrupted.current ? 0 : delta,
              )
            : desired,
        );
      }
      initialized.current = true;
    }
    interrupted.current = !snapshot.canProgress;
    for (const [tool, cursor] of [
      [left.current, leftCursor.current],
      [right.current, rightCursor.current],
    ]) {
      if (!cursor) continue;
      cursor.visible = !!tool?.visible;
      if (tool?.visible) {
        const tip = composePose(poseOf(tool), {
          position: { ...TIP_OFFSET },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }).position;
        cursor.position.set(tip.x, tip.y, tip.z + 0.04);
      }
    }
    if (halo.current && needle.current) {
      const feedback = pickupFeedback(snapshot);
      halo.current.visible = !snapshot.object.heldBy;
      halo.current.position.copy(needle.current.position);
      halo.current.position.z += 0.05;
      halo.current.scale.setScalar(feedback.radius);
      const ring = halo.current.getObjectByName("pickup-halo");
      if (ring instanceof Mesh && ring.material instanceof MeshBasicMaterial) {
        ring.material.color.set(
          feedback.ready
            ? "#4ade80"
            : snapshot.canProgress
              ? "#cbd5e1"
              : "#64748b",
        );
      }
    }
    frames.current.push(now);
    while (frames.current.length && frames.current[0] < now - 1000)
      frames.current.shift();
    diagnosticsRef.current = {
      fps: frames.current.length,
      frames: ++totalFrames.current,
      timing: timing.current,
      snapshot,
      exercise: exerciseSnapshot,
      ghost: ghostSnapshot,
      rendered: {
        left: left.current?.visible ? poseOf(left.current) : null,
        right: right.current?.visible ? poseOf(right.current) : null,
        object: needle.current ? poseOf(needle.current) : null,
      },
    };
  });

  const pegScene = exercise?.skill.id === "peg-transfer";
  return (
    <>
      {camera instanceof OrthographicCamera && (
        <primitive
          object={camera}
          zoom={Math.min(size.width / 3.6, size.height / 2.6)}
          onUpdate={(value: OrthographicCamera) =>
            value.updateProjectionMatrix()
          }
        />
      )}
      <OperatingRoom performanceMode={performanceMode} />
      <RoomCamera />
      <TrainingField>
        <TrainingTarget
          skillId={exercise?.skill.id}
          performanceMode={performanceMode}
        />
        {pegScene ? (
          <PegTransferTargets ref={targets} />
        ) : (
          <ExerciseTargets ref={targets} />
        )}
        <GhostLayer ref={ghostGroup} />
        <Instrument side="left" ref={left} />
        <Instrument side="right" ref={right} />
        {pegScene ? (
          <PracticePeg ref={needle} />
        ) : (
          <PracticeNeedle ref={needle} />
        )}
        <PickupHalo ref={halo} />
        <TipCursor side="left" ref={leftCursor} />
        <TipCursor side="right" ref={rightCursor} />
      </TrainingField>
    </>
  );
}

export default function TrainingScene(props: TrainingSceneProps) {
  return (
    <Canvas
      aria-label="3D instrument workspace"
      frameloop={props.active === false ? "demand" : "always"}
      shadows={props.performanceMode ? false : "percentage"}
      onCreated={({ gl }) => {
        if (configureRoomRenderer(gl)) props.onPerformanceFallback?.();
      }}
      camera={{ position: [0, 3.5, 3], fov: 50, near: 0.05, far: 40 }}
      dpr={props.performanceMode ? 1 : [1, 1.5]}
      gl={{ antialias: true }}
      fallback={
        <p className="p-4 text-sm text-slate-100">
          3D rendering is unavailable. Enable WebGL and retry the scene.
        </p>
      }
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
