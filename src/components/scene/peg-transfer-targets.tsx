"use client";

import { forwardRef, useMemo } from "react";
import { CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { ExerciseSnapshot } from "@/lib/exercise/exercise-controller";
import {
  BOARD_EDGE_ZONE,
  PEG_CORRIDOR,
  SOURCE_POST,
  TARGET_POST,
  TRANSFER_ZONE,
} from "@/lib/exercise/peg-transfer-config";

function setMeshColor(root: Group, name: string, hex: string) {
  const obj = root.getObjectByName(name);
  if (obj instanceof Mesh && (obj.material instanceof MeshStandardMaterial || obj.material instanceof MeshBasicMaterial)) {
    obj.material.color.set(hex);
  }
}

export function updatePegTransferTargets(root: Group | null, snapshot: ExerciseSnapshot | null) {
  if (!root || !snapshot) return;
  const highlight = snapshot.modeHooks.highlightCurrentTarget;
  for (const target of [SOURCE_POST, TRANSFER_ZONE, TARGET_POST]) {
    const completed = snapshot.completedTargetIds.includes(target.id);
    const active = highlight && snapshot.activeTargetId === target.id;
    setMeshColor(root, target.id, completed ? "#4ade80" : active ? "#38bdf8" : "#94a3b8");
  }
  const guide = root.getObjectByName("peg-corridor-guide");
  if (guide) guide.visible = snapshot.modeHooks.showPathGuide;
  setMeshColor(root, BOARD_EDGE_ZONE.id, snapshot.inDangerZone ? "#ef4444" : "#9f1239");
}

function Post({ id, position, color }: { id: string; position: Readonly<{ x: number; y: number; z: number }>; color: string }) {
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh position={[0, -0.07, 0]}>
        <cylinderGeometry args={[0.012, 0.016, 0.14, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh name={id} position={[0, 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.034, 0.006, 10, 24]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

export const PegTransferTargets = forwardRef<Group>(function PegTransferTargets(_, ref) {
  const corridorCurve = useMemo(
    () => new CatmullRomCurve3(PEG_CORRIDOR.map(point => new Vector3(point.x, point.y, point.z))),
    [],
  );

  return (
    <group ref={ref} name="peg-transfer-targets">
      <mesh name="peg-corridor-guide" renderOrder={10}>
        <tubeGeometry args={[corridorCurve, 24, 0.004, 6, false]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.45} />
      </mesh>
      <Post id={SOURCE_POST.id} position={SOURCE_POST.position} color="#94a3b8" />
      <group position={[TRANSFER_ZONE.position.x, TRANSFER_ZONE.position.y, TRANSFER_ZONE.position.z]}>
        <mesh name={TRANSFER_ZONE.id} renderOrder={12}>
          <ringGeometry args={[0.055, 0.07, 32]} />
          <meshBasicMaterial color="#94a3b8" transparent opacity={0.8} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
      <Post id={TARGET_POST.id} position={TARGET_POST.position} color="#94a3b8" />
      <mesh
        name={BOARD_EDGE_ZONE.id}
        position={[BOARD_EDGE_ZONE.center.x, BOARD_EDGE_ZONE.center.y, BOARD_EDGE_ZONE.center.z - 0.04]}
      >
        <boxGeometry
          args={[
            BOARD_EDGE_ZONE.halfExtents.x * 2,
            BOARD_EDGE_ZONE.halfExtents.y * 2,
            BOARD_EDGE_ZONE.halfExtents.z,
          ]}
        />
        <meshStandardMaterial color="#9f1239" transparent opacity={0.55} />
      </mesh>
    </group>
  );
});
