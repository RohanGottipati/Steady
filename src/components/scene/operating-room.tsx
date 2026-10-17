"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { forwardRef } from "react";
import type { Group } from "three";

export function OperatingRoom() {
  return <>
    <color attach="background" args={["#101e29"]} />
    <group>
    <ambientLight intensity={0.58} color="#dce8ee" />
    <directionalLight position={[1.4, 3.1, 4.1]} intensity={1.65} color="#f7f4ee" />
    <directionalLight position={[-1.8, 1.1, 3.2]} intensity={0.72} color="#d0dde6" />
    <pointLight position={[-0.4, 1.8, 2.3]} intensity={3.4} color="#e3f4f7" distance={9} decay={2} />
    <mesh position={[0, -0.98, -0.1]}>
      <boxGeometry args={[3.8, 0.14, 2.3]} /><meshStandardMaterial color="#3b6874" roughness={0.85} />
    </mesh>
    <mesh position={[0, -1.42, -0.1]}>
      <boxGeometry args={[0.65, 0.8, 0.7]} /><meshStandardMaterial color="#647783" metalness={0.45} roughness={0.4} />
    </mesh>
    <mesh position={[0, 0.06, -0.28]}>
      <boxGeometry args={[2.7, 1.85, 0.1]} /><meshStandardMaterial color="#365e65" roughness={0.9} />
    </mesh>
    <mesh position={[0, 0.25, -0.2]}>
      <boxGeometry args={[1.7, 0.95, 0.08]} /><meshStandardMaterial color="#bc8a83" roughness={0.95} />
    </mesh>
    {[-0.55, 0, 0.55].map(x => <mesh key={x} position={[x, 0.25, -0.155]}>
      <boxGeometry args={[0.003, 0.8, 0.003]} /><meshStandardMaterial color="#aa7c77" roughness={1} />
    </mesh>)}
    {[0, 0.25, 0.5].map(y => <mesh key={y} position={[0, y, -0.155]}>
      <boxGeometry args={[1.5, 0.003, 0.003]} /><meshStandardMaterial color="#aa7c77" roughness={1} />
    </mesh>)}
    <mesh position={[0, -1.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 20]} /><meshStandardMaterial color="#243844" roughness={1} />
    </mesh>
    <mesh position={[0, 1.4, -2.1]}>
      <boxGeometry args={[8, 6, 0.1]} /><meshStandardMaterial color="#24404c" roughness={1} />
    </mesh>
    {[-2.7, 2.7].map(x => <group key={x} position={[x, -0.7, -1.5]}>
      <mesh><boxGeometry args={[0.7, 1.5, 0.5]} /><meshStandardMaterial color="#607784" metalness={0.25} roughness={0.6} /></mesh>
      <mesh position={[0, 1.05, 0.1]}><boxGeometry args={[0.7, 0.5, 0.08]} /><meshStandardMaterial color="#081b26" emissive="#174e5c" emissiveIntensity={0.45} /></mesh>
    </group>)}
    <mesh position={[0, 2, -0.8]} rotation={[0.3, 0, 0]}>
      <cylinderGeometry args={[0.45, 0.38, 0.09, 24]} /><meshStandardMaterial color="#d5dee4" emissive="#8eb4be" emissiveIntensity={0.18} />
    </mesh>
    </group>
  </>;
}

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
