"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { forwardRef } from "react";
import type { Group } from "three";
import type { RouteObjectKind } from "@/lib/exercise/route-tasks";

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

export const PracticeSuture = forwardRef<Group>(function PracticeSuture(_, ref) {
  return (
    <group ref={ref} name="practice-suture">
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, 0.16, 8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.016, 10, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
});

export const PracticeLoop = forwardRef<Group>(function PracticeLoop(_, ref) {
  return (
    <group ref={ref} name="practice-loop">
      <mesh>
        <torusGeometry args={[0.028, 0.006, 10, 24]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
});

export const PracticeClip = forwardRef<Group>(function PracticeClip(_, ref) {
  return (
    <group ref={ref} name="practice-clip">
      <mesh position={[-0.012, 0.012, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.008, 0.04, 0.012]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0.012, 0.012, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.008, 0.04, 0.012]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
});

export const PracticeTissue = forwardRef<Group>(function PracticeTissue(_, ref) {
  return (
    <group ref={ref} name="practice-tissue">
      <mesh>
        <boxGeometry args={[0.05, 0.012, 0.03]} />
        <meshStandardMaterial color="#fb7185" roughness={0.7} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color="#86efac" emissive="#166534" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
});

export const PracticeMarker = forwardRef<Group>(function PracticeMarker(_, ref) {
  return (
    <group ref={ref} name="practice-marker">
      <mesh>
        <octahedronGeometry args={[0.016, 0]} />
        <meshStandardMaterial color="#fbbf24" emissive="#92400e" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
});

export const PracticeRouteObject = forwardRef<Group, { kind: RouteObjectKind }>(function PracticeRouteObject({ kind }, ref) {
  if (kind === "needle") return <PracticeNeedle ref={ref} />;
  if (kind === "suture") return <PracticeSuture ref={ref} />;
  if (kind === "loop") return <PracticeLoop ref={ref} />;
  if (kind === "clip") return <PracticeClip ref={ref} />;
  if (kind === "tissue") return <PracticeTissue ref={ref} />;
  return <PracticeMarker ref={ref} />;
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
