"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { forwardRef } from "react";
import type { Group } from "three";

export { RoomScenery as OperatingRoom } from "./room-environment";

export const PracticePeg = forwardRef<Group>(function PracticePeg(_, ref) {
  return (
    <group ref={ref} name="practice-peg">
      <mesh position={[0, 0.028, 0]}>
        <cylinderGeometry args={[0.016, 0.02, 0.055, 12]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.55} roughness={0.32} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.02, 12, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
});

export const PracticeNeedle = forwardRef<Group>(function PracticeNeedle(_, ref) {
  // The middle of this curve is exactly the local grab point (0,0,0).
  const curve = useMemo(() => new CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => {
    const angle = (i / 24 - 0.5) * Math.PI * 1.4;
    return new Vector3(0.13 * Math.sin(angle), 0.13 * (Math.cos(angle) - 1), 0);
  })), []);
  return <group ref={ref} name="practice-needle">
    <mesh><tubeGeometry args={[curve, 32, 0.009, 6, false]} /><meshStandardMaterial color="#d7dee6" metalness={0.42} roughness={0.4} /></mesh>
    <mesh><sphereGeometry args={[0.022, 12, 8]} /><meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.5} /></mesh>
  </group>;
});
