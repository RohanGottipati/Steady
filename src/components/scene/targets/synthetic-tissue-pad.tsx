"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { NEEDLE_PASSING_RINGS } from "@/lib/exercise/needle-passing-config";
import { FIELD_FLOOR_Z, TISSUE_PAD, TISSUE_PAD_SURFACE_BASE_Z } from "@/data/training-targets";
import { buildTissueSurfaceGeometry, tissueSurfaceHeight, type TissueSurfaceSpec } from "./tissue-surface";
import { useSkinMaterial } from "./tissue-materials";

const [CX, CY] = TISSUE_PAD.center;

export function tissuePadSpec(withIncision: boolean): TissueSurfaceSpec {
  const cut = TISSUE_PAD.incision;
  return {
    width: TISSUE_PAD.width - 0.012,
    depth: TISSUE_PAD.depth - 0.012,
    height: TISSUE_PAD.domeHeight,
    incision: withIncision
      ? { x: cut.x - CX, yStart: cut.yStart - CY, yEnd: cut.yEnd - CY, depth: cut.depth, halfWidth: cut.halfWidth }
      : undefined,
  };
}

/** Training-local Z of the skin surface at absolute training-local (x, y). */
export function tissuePadSurfaceZ(x: number, y: number, withIncision = true) {
  return TISSUE_PAD_SURFACE_BASE_Z + 0.0015 + tissueSurfaceHeight(tissuePadSpec(withIncision), x - CX, y - CY);
}

/** Layered silicone skin pad: subcutaneous foam, dermis, raised textured epidermis. */
export function TissueBlock({
  withIncision,
  performanceMode = false,
  children,
}: {
  withIncision: boolean;
  performanceMode?: boolean;
  children?: React.ReactNode;
}) {
  const skin = useSkinMaterial(performanceMode);
  const surface = useMemo(() => buildTissueSurfaceGeometry(tissuePadSpec(withIncision)), [withIncision]);
  useEffect(() => () => surface.dispose(), [surface]);
  const { width, depth, fatThickness, dermisThickness } = TISSUE_PAD;
  return (
    <group name="synthetic-tissue-pad" position={[CX, CY, 0]}>
      <RoundedBox
        args={[width, depth, fatThickness]}
        radius={0.01}
        smoothness={3}
        position={[0, 0, FIELD_FLOOR_Z + fatThickness / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#e6c27f" roughness={0.78} />
      </RoundedBox>
      <RoundedBox
        args={[width - 0.004, depth - 0.004, dermisThickness]}
        radius={0.006}
        smoothness={3}
        position={[0, 0, FIELD_FLOOR_Z + fatThickness + dermisThickness / 2]}
        receiveShadow
      >
        <meshStandardMaterial color="#cf8c7c" roughness={0.6} />
      </RoundedBox>
      <mesh
        name="tissue-surface"
        geometry={surface}
        material={skin}
        position={[0, 0, TISSUE_PAD_SURFACE_BASE_Z + 0.0015]}
        receiveShadow
        dispose={null}
      />
      {children}
    </group>
  );
}

function Incision() {
  const cut = TISSUE_PAD.incision;
  const length = cut.yEnd - cut.yStart;
  const midY = (cut.yStart + cut.yEnd) / 2;
  const floor = TISSUE_PAD_SURFACE_BASE_Z + TISSUE_PAD.domeHeight - cut.depth + 0.004;
  return (
    <mesh name="tissue-incision" position={[cut.x - CX, midY - CY, floor]} scale={[1, length / 0.02, 1]}>
      <sphereGeometry args={[0.01, 16, 12]} />
      <meshPhysicalMaterial color="#7a1a1a" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} />
    </mesh>
  );
}

/** Surgical-marker entry/exit dots projected onto the skin under Ring 1 and Ring 3. */
function BiteMarkers() {
  const markers = [NEEDLE_PASSING_RINGS[0], NEEDLE_PASSING_RINGS[2]];
  return (
    <>
      {markers.map((ring, index) => {
        const z = tissuePadSurfaceZ(ring.position.x, ring.position.y) + 0.0008;
        return (
          <group
            key={ring.id}
            name={index === 0 ? "tissue-entry-region" : "tissue-exit-region"}
            position={[ring.position.x - CX, ring.position.y - CY, z - 0]}
          >
            <mesh>
              <ringGeometry args={[0.018, 0.023, 28]} />
              <meshBasicMaterial color="#5b2a86" transparent opacity={0.7} depthWrite={false} />
            </mesh>
            <mesh>
              <circleGeometry args={[0.005, 16]} />
              <meshBasicMaterial color="#4a1010" transparent opacity={0.85} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/**
 * Needle passing / suturing target: synthetic skin pad positioned under the existing rings.
 * Its local frame is the training-local frame offset by TISSUE_PAD.center in X/Y only.
 */
export function SyntheticTissuePad({ performanceMode = false }: { performanceMode?: boolean }) {
  return (
    <TissueBlock withIncision performanceMode={performanceMode}>
      <Incision />
      <BiteMarkers />
    </TissueBlock>
  );
}

export function FallbackTrainingTarget({ performanceMode = false }: { performanceMode?: boolean }) {
  return <TissueBlock withIncision={false} performanceMode={performanceMode} />;
}
