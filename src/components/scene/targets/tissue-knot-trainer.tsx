"use client";

import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { KNOT_TRAINER, TISSUE_PAD, TISSUE_PAD_SURFACE_BASE_Z } from "@/data/training-targets";
import { TissueBlock } from "./synthetic-tissue-pad";

const [CX, CY] = TISSUE_PAD.center;

/** Knot tying target: vessel-style tube clamped over the tissue pad with a suture through it. */
export function TissueKnotTrainer({ performanceMode = false }: { performanceMode?: boolean }) {
  const { y, halfLength, radius } = KNOT_TRAINER.vessel;
  const vesselZ = TISSUE_PAD_SURFACE_BASE_Z + TISSUE_PAD.domeHeight + radius * 0.6;
  const suture = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          [-0.16, y - 0.12, -0.002],
          [-0.05, y - 0.06, 0.004],
          [-0.01, y - radius, vesselZ - TISSUE_PAD_SURFACE_BASE_Z + 0.02],
          [0.01, y + radius, vesselZ - TISSUE_PAD_SURFACE_BASE_Z + 0.02],
          [0.05, y - 0.06, 0.004],
          [0.18, y - 0.1, -0.002],
        ].map(([x, py, z]) => new Vector3(x - CX, py - CY, TISSUE_PAD_SURFACE_BASE_Z + TISSUE_PAD.domeHeight + z)),
      ),
    [y, radius, vesselZ],
  );
  return (
    <TissueBlock withIncision={false} performanceMode={performanceMode}>
      <group name="tissue-knot-trainer">
        <mesh name="knot-vessel" position={[0, y - CY, vesselZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[radius, halfLength * 2, 8, 24]} />
          <meshPhysicalMaterial color="#b4545c" roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.3} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (halfLength - 0.02), y - CY, vesselZ]} castShadow>
            <boxGeometry args={[0.02, radius * 3.2, radius * 2.6]} />
            <meshStandardMaterial color="#9aa4ad" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh name="knot-suture">
          <tubeGeometry args={[suture, 64, 0.0028, 6, false]} />
          <meshStandardMaterial color="#6d3fc0" roughness={0.45} />
        </mesh>
      </group>
    </TissueBlock>
  );
}
