"use client";

import { forwardRef, useMemo } from "react";
import { CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";
import type { ExerciseSnapshot } from "@/lib/exercise/exercise-controller";
import { TISSUE_PAD_SURFACE_BASE_Z } from "@/data/training-targets";
import { corridorArcPoint, NEEDLE_PASSING_RINGS, RELEASE_ZONE, TISSUE_WALL_ZONE } from "@/lib/exercise/needle-passing-config";

function setMeshColor(root: Group, name: string, hex: string) {
  const obj = root.getObjectByName(name);
  if (obj instanceof Mesh && (obj.material instanceof MeshStandardMaterial || obj.material instanceof MeshBasicMaterial)) {
    obj.material.color.set(hex);
  }
}

/** Resting colour of the tissue-wall fold; it turns red while a tool is inside the danger zone. */
export const TISSUE_WALL_COLOR = "#c98676";

export function updateExerciseTargets(root: Group | null, snapshot: ExerciseSnapshot | null) {
  if (!root || !snapshot) return;
  const highlight = snapshot.modeHooks.highlightCurrentTarget;
  for (const ring of NEEDLE_PASSING_RINGS) {
    const completed = snapshot.completedTargetIds.includes(ring.id);
    const active = highlight && snapshot.activeTargetId === ring.id;
    setMeshColor(root, ring.id, completed ? "#4ade80" : active ? "#38bdf8" : "#94a3b8");
  }
  const guide = root.getObjectByName("corridor-guide");
  if (guide) guide.visible = snapshot.modeHooks.showPathGuide;

  const releaseActive = highlight && snapshot.activeTargetId === RELEASE_ZONE.id;
  setMeshColor(
    root,
    RELEASE_ZONE.id,
    snapshot.phase === "complete" ? "#4ade80" : releaseActive ? "#38bdf8" : "#64748b",
  );
  setMeshColor(root, TISSUE_WALL_ZONE.id, snapshot.inDangerZone ? "#ef4444" : TISSUE_WALL_COLOR);
}

export const ExerciseTargets = forwardRef<Group>(function ExerciseTargets(_, ref) {
  const corridorCurve = useMemo(
    () =>
      new CatmullRomCurve3(
        Array.from({ length: 21 }, (_, index) => {
          const p = corridorArcPoint(index / 20);
          return new Vector3(p.x, p.y, p.z);
        }),
      ),
    [],
  );

  return (
    <group ref={ref} name="exercise-targets">
      <mesh name="corridor-guide" renderOrder={10}>
        <tubeGeometry args={[corridorCurve, 24, 0.004, 6, false]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
      </mesh>
      {NEEDLE_PASSING_RINGS.map(ring => (
        <group key={ring.id} position={[ring.position.x, ring.position.y, ring.position.z]} rotation={[0, 0, ring.tiltRad]}>
          <mesh name={ring.id}>
            <torusGeometry args={[0.048, 0.007, 12, 32]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.22} roughness={0.42} />
          </mesh>
          <mesh position={[0, -0.055, -0.07]}>
            <boxGeometry args={[0.01, 0.06, 0.14]} />
            <meshStandardMaterial color="#64748b" metalness={0.2} roughness={0.55} />
          </mesh>
        </group>
      ))}
      <group position={[RELEASE_ZONE.position.x, RELEASE_ZONE.position.y, RELEASE_ZONE.position.z]}>
        <mesh name={RELEASE_ZONE.id} renderOrder={12}>
          <ringGeometry args={[0.065, 0.08, 36]} />
          <meshBasicMaterial color="#64748b" transparent opacity={0.75} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
      {/* Visual tissue fold along the canonical tissue-wall danger band; the collision box itself is unchanged. */}
      <mesh
        name={TISSUE_WALL_ZONE.id}
        position={[TISSUE_WALL_ZONE.center.x, TISSUE_WALL_ZONE.center.y, TISSUE_PAD_SURFACE_BASE_Z + 0.004]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[1, 1, 0.7]}
        castShadow
      >
        <capsuleGeometry args={[TISSUE_WALL_ZONE.halfExtents.y * 0.5, TISSUE_WALL_ZONE.halfExtents.x * 2 - TISSUE_WALL_ZONE.halfExtents.y, 8, 32]} />
        <meshStandardMaterial color={TISSUE_WALL_COLOR} roughness={0.55} />
      </mesh>
    </group>
  );
});
