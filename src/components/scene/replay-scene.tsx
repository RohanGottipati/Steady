"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineSegments, LineBasicMaterial, Mesh, MeshStandardMaterial, OrthographicCamera } from "three";
import type { ReplayController, ReplaySnapshot, ReplayTrails } from "@/lib/simulation/replay-controller";
import type { Pose } from "@/lib/simulation/tool-simulation";
import type { Vec3 } from "@/types";
import { Instrument } from "./instrument";
import { OperatingRoom, PracticeNeedle } from "./operating-room";
import { ExerciseTargets } from "./exercise-targets";

export interface ReplayDiagnostics {
  user: { left: Pose | null; right: Pose | null };
  reference: { left: Pose | null; right: Pose | null };
  needle: Pose | null;
}
export interface ReplaySceneProps {
  controller: ReplayController;
  diagnosticsRef?: RefObject<ReplayDiagnostics | null>;
  onStatus: (status: "ready" | "lost") => void;
}
function apply(group: Group, pose: Pose) {
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
}
function points(line: Line, path: readonly Vec3[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(path.flatMap(p => [p.x, p.y, p.z]), 3));
  geometry.computeBoundingSphere();
  line.geometry.dispose(); line.geometry = geometry;
}

/** Updates actual Three groups; no React state is driven by display frames. */
export function updateReplayLayer(root: Group | null, snapshot: ReplaySnapshot, trails: ReplayTrails) {
  if (!root) return;
  for (const actor of ["user", "reference"] as const) {
    const sample = snapshot[actor];
    for (const side of ["left", "right"] as const) {
      const group = root.getObjectByName(`replay-${actor}-${side}`);
      const visible = Boolean(sample) && snapshot.visible[side] && (actor === "user" || snapshot.showExpert);
      if (group instanceof Group) {
        group.visible = visible;
        if (sample && visible) {
          const tool = sample[side === "left" ? "leftTool" : "rightTool"];
          apply(group, tool);
          for (const [name, sign] of [["jaw-left", -1], ["jaw-right", 1]] as const) {
            const jaw = group.getObjectByName(name);
            if (jaw) { jaw.rotation.z = tool.jawClosed ? 0 : sign * -0.24; jaw.position.x = tool.jawClosed ? sign * 0.006 : 0; }
          }
        }
      }
      const path = root.getObjectByName(`replay-${actor}-${side}-path`);
      if (path instanceof Line) {
        path.visible = snapshot.showPaths && (actor === "user" || snapshot.showExpert);
        // Paths are prepared once, then replaced only when smoothing changes.
        if (path.userData.points !== trails[actor][side]) {
          points(path, trails[actor][side]); path.userData.points = trails[actor][side];
        }
      }
    }
  }
  for (const side of ["left", "right"] as const) {
    const connector = root.getObjectByName(`replay-${side}-deviation`);
    if (connector instanceof Line) {
      connector.visible = snapshot.showExpert && snapshot.visible[side] && snapshot.comparisonAvailable;
      if (snapshot.user && snapshot.reference) {
        const key = side === "left" ? "leftTool" : "rightTool";
        const a = snapshot.user[key].tipPosition, b = snapshot.reference[key].tipPosition;
        const attr = connector.geometry.getAttribute("position");
        attr.setXYZ(0, a.x, a.y, a.z); attr.setXYZ(1, b.x, b.y, b.z); attr.needsUpdate = true;
        connector.geometry.computeBoundingSphere();
      }
    }
  }
}
function ReplayInstrument({ side, expert }: { side: "left" | "right"; expert: boolean }) {
  const instrument = useRef<Group>(null);
  useLayoutEffect(() => {
    if (!instrument.current) return;
    instrument.current.visible = true;
    if (expert) instrument.current.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
        object.material.transparent = true; object.material.opacity = 0.32;
        object.material.depthWrite = false; object.material.color.set("#a5b4fc");
        object.material.emissive.set("#6366f1"); object.material.emissiveIntensity = 0.3;
      }
    });
  }, [expert]);
  return <group name={`replay-${expert ? "reference" : "user"}-${side}`}><Instrument ref={instrument} side={side} /></group>;
}
function ReplayLines() {
  const lines = useMemo(() => {
    const result: Line[] = [];
    for (const actor of ["user", "reference"] as const) for (const side of ["left", "right"] as const) {
      const line = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: actor === "reference" ? "#a5b4fc" : side === "left" ? "#22d3ee" : "#fbbf24",
        transparent: true, opacity: 0.8, depthWrite: false }));
      line.name = `replay-${actor}-${side}-path`; result.push(line);
    }
    for (const side of ["left", "right"] as const) {
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3));
      const line = new Line(geometry, new LineBasicMaterial({ color: "#fb7185", depthTest: false }));
      line.name = `replay-${side}-deviation`; result.push(line);
    }
    return result;
  }, []);
  useEffect(() => () => { for (const line of lines) { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); } }, [lines]);
  return <>{lines.map(line => <primitive key={line.name} object={line} />)}</>;
}
export function ReplayLoop({ controller, diagnosticsRef, onStatus, onFrame }: ReplaySceneProps & { onFrame: (snapshot: ReplaySnapshot) => void }) {
  const lost = useRef(false), skipDelta = useRef(true);
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    lost.current = gl.getContext().isContextLost();
    skipDelta.current = true;
    const contextLost = (event: Event) => { event.preventDefault(); lost.current = true; controller.pause(); skipDelta.current = true; onStatus("lost"); };
    const restored = () => { lost.current = false; skipDelta.current = true; onStatus("ready"); };
    const visibility = () => { skipDelta.current = true; if (document.hidden) controller.pause(); };
    canvas.addEventListener("webglcontextlost", contextLost); canvas.addEventListener("webglcontextrestored", restored);
    document.addEventListener("visibilitychange", visibility);
    onStatus(lost.current ? "lost" : "ready");
    return () => {
      canvas.removeEventListener("webglcontextlost", contextLost); canvas.removeEventListener("webglcontextrestored", restored);
      document.removeEventListener("visibilitychange", visibility); controller.pause();
      if (diagnosticsRef) diagnosticsRef.current = null;
    };
  }, [controller, gl, onStatus, diagnosticsRef]);
  useFrame((_, delta) => {
    if (lost.current || document.hidden) { controller.pause(); skipDelta.current = true; return; }
    const snapshot = controller.update(skipDelta.current ? 0 : delta); skipDelta.current = false;
    onFrame(snapshot);
  });
  return null;
}
export function ReplaySceneContent({ controller, diagnosticsRef, onStatus }: ReplaySceneProps) {
  const root = useRef<Group>(null), needle = useRef<Group>(null);
  const { camera, size } = useThree();
  const renderFrame = (snapshot: ReplaySnapshot) => {
    updateReplayLayer(root.current, snapshot, controller.getTrails());
    if (needle.current) { needle.current.visible = !!snapshot.needle; if (snapshot.needle) apply(needle.current, snapshot.needle); }
    if (diagnosticsRef) {
      const pose = (actor: "user" | "reference", side: "left" | "right") => {
        const group = root.current?.getObjectByName(`replay-${actor}-${side}`);
        return group?.visible ? { position: { x: group.position.x, y: group.position.y, z: group.position.z },
          rotation: { x: group.quaternion.x, y: group.quaternion.y, z: group.quaternion.z, w: group.quaternion.w } } : null;
      };
      diagnosticsRef.current = { user: { left: pose("user", "left"), right: pose("user", "right") },
        reference: { left: pose("reference", "left"), right: pose("reference", "right") },
        needle: needle.current?.visible ? { position: { x: needle.current.position.x, y: needle.current.position.y, z: needle.current.position.z },
          rotation: { x: needle.current.quaternion.x, y: needle.current.quaternion.y, z: needle.current.quaternion.z, w: needle.current.quaternion.w } } : null };
    }
  };
  return <>
    <ReplayLoop controller={controller} diagnosticsRef={diagnosticsRef} onStatus={onStatus} onFrame={renderFrame} />
    {camera instanceof OrthographicCamera && <primitive object={camera} zoom={Math.min(size.width / 3.6, size.height / 2.6)} onUpdate={(value: OrthographicCamera) => value.updateProjectionMatrix()} />}
    <OperatingRoom /><ExerciseTargets />
    <group ref={root}>
      <ReplayInstrument side="left" expert={false} /><ReplayInstrument side="right" expert={false} />
      <ReplayInstrument side="left" expert /><ReplayInstrument side="right" expert /><ReplayLines />
    </group>
    <PracticeNeedle ref={needle} />
  </>;
}
export default function ReplayScene(props: ReplaySceneProps) {
  return <Canvas aria-label="3D attempt replay" orthographic camera={{ position: [0, 0.15, 4], zoom: 160, near: 0.05, far: 30 }}
    dpr={[1, 1.5]} gl={{ antialias: true }} fallback={<p>3D replay is unavailable. Enable WebGL and retry.</p>}>
    <ReplaySceneContent {...props} />
  </Canvas>;
}
