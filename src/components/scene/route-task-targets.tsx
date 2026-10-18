"use client";

import { forwardRef, useMemo } from "react";
import { CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { ExerciseSnapshot } from "@/lib/exercise/exercise-controller";
import { getRouteTask, type RoutePhase, type RouteTask } from "@/lib/exercise/route-tasks";

function setMeshColor(root: Group, name: string, hex: string) {
  const obj = root.getObjectByName(name);
  if (obj instanceof Mesh && (obj.material instanceof MeshStandardMaterial || obj.material instanceof MeshBasicMaterial)) {
    obj.material.color.set(hex);
  }
}

export function updateRouteTaskTargets(root: Group | null, snapshot: ExerciseSnapshot | null) {
  if (!root || !snapshot) return;
  const task = getRouteTask(snapshot.skillId);
  if (!task) return;
  const highlight = snapshot.modeHooks.highlightCurrentTarget;
  const seen = new Set<string>();
  for (const item of task.phases) {
    if (seen.has(item.targetId)) continue;
    seen.add(item.targetId);
    const completed = snapshot.completedTargetIds.includes(item.targetId);
    const active = highlight && snapshot.activeTargetId === item.targetId;
    setMeshColor(root, item.targetId, completed ? "#4ade80" : active ? "#38bdf8" : "#94a3b8");
  }
  const guide = root.getObjectByName("route-corridor-guide");
  if (guide) guide.visible = snapshot.modeHooks.showPathGuide;
  setMeshColor(root, task.danger.id, snapshot.inDangerZone ? "#ef4444" : "#9f1239");
}

function Marker({ phase }: { phase: RoutePhase }) {
  const raised = phase.kind === "carry" || phase.kind === "trace" || phase.kind === "lift";
  return (
    <group position={[phase.position.x, phase.position.y, phase.position.z]}>
      {raised ? (
        <mesh name={phase.targetId} renderOrder={12}>
          <ringGeometry args={[0.045, 0.06, 28]} />
          <meshBasicMaterial color="#94a3b8" transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, -0.055, 0]}>
            <cylinderGeometry args={[0.01, 0.014, 0.11, 10]} />
            <meshStandardMaterial color="#64748b" metalness={0.4} roughness={0.45} />
          </mesh>
          <mesh name={phase.targetId} position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.03, 0.005, 8, 20]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.4} />
          </mesh>
        </>
      )}
    </group>
  );
}

export const RouteTaskTargets = forwardRef<Group, { task: RouteTask }>(function RouteTaskTargets({ task }, ref) {
  const corridorCurve = useMemo(
    () => new CatmullRomCurve3(task.corridor.map(point => new Vector3(point.x, point.y, point.z))),
    [task],
  );
  const markers = task.phases.filter((item, index, all) => item.targetId !== task.objectId && all.findIndex(other => other.targetId === item.targetId) === index);

  return (
    <group ref={ref} name={`${task.skillId}-targets`}>
      <mesh name="route-corridor-guide" renderOrder={10}>
        <tubeGeometry args={[corridorCurve, 28, 0.004, 6, false]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.45} />
      </mesh>
      {markers.map(item => <Marker key={item.targetId} phase={item} />)}
      <mesh name={task.danger.id} position={[task.danger.center.x, task.danger.center.y, task.danger.center.z - 0.04]}>
        <boxGeometry args={[task.danger.halfExtents.x * 2, task.danger.halfExtents.y * 2, task.danger.halfExtents.z]} />
        <meshStandardMaterial color="#9f1239" transparent opacity={0.55} />
      </mesh>
    </group>
  );
});
