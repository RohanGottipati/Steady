"use client";

import { forwardRef } from "react";
import type { Group } from "three";

/** Face the fixed camera independently of palm rotation; these are aim guides. */
export const TipCursor = forwardRef<Group, { side: "left" | "right" }>(function TipCursor({ side }, ref) {
  return <group ref={ref} visible={false}>
    <mesh renderOrder={20}>
      <ringGeometry args={[0.032, 0.043, 32]} />
      <meshBasicMaterial color={side === "left" ? "#22d3ee" : "#fbbf24"} depthTest={false} depthWrite={false} />
    </mesh>
    <mesh renderOrder={20}><boxGeometry args={[0.017, 0.003, 0.001]} /><meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} /></mesh>
    <mesh renderOrder={20}><boxGeometry args={[0.003, 0.017, 0.001]} /><meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} /></mesh>
  </group>;
});

export const PickupHalo = forwardRef<Group>(function PickupHalo(_, ref) {
  return <group ref={ref}>
    <mesh name="pickup-halo" renderOrder={19}>
      <ringGeometry args={[0.94, 1, 48]} />
      <meshBasicMaterial color="#94a3b8" transparent opacity={0.8} depthTest={false} depthWrite={false} />
    </mesh>
  </group>;
});
