"use client";

import { forwardRef } from "react";
import type { Group } from "three";
import { TIP_OFFSET } from "@/lib/simulation/tool-simulation";

/** Flat tweezers and angular pistol-grip instrument; local +Y ends at TIP_OFFSET. */
export const Instrument = forwardRef<Group, { side: "left" | "right" }>(function Instrument({ side }, ref) {
  const color = side === "left" ? "#22d3ee" : "#fbbf24";
  return <group ref={ref} visible={false} name={`${side}-instrument`}>
    {side === "left" ? <>
      {[-1, 1].map(sign => <group key={sign}>
        <mesh position={[sign * 0.025, 0.025, 0]} rotation={[0, 0, sign * 0.045]}>
          <boxGeometry args={[0.018, 0.49, 0.025]} />
          <meshStandardMaterial color="#d4e1e8" metalness={0.38} roughness={0.46} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[sign * 0.027, -0.13 + i * 0.021, 0.017]}>
          <boxGeometry args={[0.026, 0.006, 0.008]} /><meshStandardMaterial color="#647985" roughness={0.7} />
        </mesh>)}
      </group>)}
      <mesh position={[0, -0.21, 0]}><boxGeometry args={[0.068, 0.03, 0.027]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
    </> : <>
      <mesh position={[0, 0.115, 0]}><boxGeometry args={[0.021, 0.31, 0.025]} /><meshStandardMaterial color="#d4e1e8" metalness={0.38} roughness={0.46} /></mesh>
      <mesh position={[0, -0.035, 0]}><boxGeometry args={[0.11, 0.1, 0.045]} /><meshStandardMaterial color="#334155" roughness={0.55} /></mesh>
      <mesh position={[0.065, -0.16, 0]} rotation={[0, 0, 0.38]}><boxGeometry args={[0.065, 0.22, 0.047]} /><meshStandardMaterial color="#334155" roughness={0.65} /></mesh>
      <mesh position={[0.065, -0.16, 0.026]} rotation={[0, 0, 0.38]}><boxGeometry args={[0.025, 0.15, 0.005]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
      <mesh position={[-0.04, -0.11, 0]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.015, 0.1, 0.025]} /><meshStandardMaterial color="#94a3b8" metalness={0.32} roughness={0.48} /></mesh>
      <mesh position={[0, 0.025, 0]}><boxGeometry args={[0.055, 0.025, 0.04]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
    </>}
    {[-1, 1].map(sign => <group key={sign} name={sign < 0 ? "jaw-left" : "jaw-right"} position={[0, TIP_OFFSET.y - 0.08, 0]}>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.012, 0.08, side === "left" ? 0.018 : 0.027]} />
        <meshStandardMaterial color="#d5dee6" metalness={0.4} roughness={0.42} />
      </mesh>
    </group>)}
  </group>;
});
