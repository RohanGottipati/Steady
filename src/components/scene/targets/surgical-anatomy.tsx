"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { HEPATOBILIARY_ANATOMY, FIELD_FLOOR_Z } from "@/data/training-targets";
import {
  buildOrganMap,
  cloneSceneWithMaterials,
  disposeClonedMaterials,
  highlightOrgan,
  type OrganId,
} from "./organ-map";

const NO_HIGHLIGHT: readonly OrganId[] = [];

/**
 * Licensed hepatobiliary anatomy (BodyParts3D, CC BY 4.0) for procedure modules.
 * The cached GLTF scene is cloned with its materials so highlighting never leaks into other views.
 */
export function SurgicalAnatomy({
  highlight = NO_HIGHLIGHT,
  onOrgans,
}: {
  highlight?: readonly OrganId[];
  onOrgans?: (organs: OrganId[]) => void;
}) {
  const { scene } = useGLTF(HEPATOBILIARY_ANATOMY.url, false, false);
  const instance = useMemo(() => cloneSceneWithMaterials(scene), [scene]);
  const organs = useMemo(() => buildOrganMap(instance), [instance]);
  useEffect(() => {
    const available = [...organs.keys()];
    if (process.env.NODE_ENV === "development") console.info("Available organs:", available);
    onOrgans?.(available);
  }, [organs, onOrgans]);
  useEffect(() => {
    for (const [organ, meshes] of organs) highlightOrgan(meshes, highlight.includes(organ));
  }, [organs, highlight]);
  useEffect(() => {
    instance.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    return () => disposeClonedMaterials(instance);
  }, [instance]);
  return (
    <group name="surgical-anatomy">
      <mesh name="anatomy-tissue-bed" position={[0, 0.17, FIELD_FLOOR_Z + 0.012]} scale={[0.4, 0.27, 0.018]} receiveShadow>
        <sphereGeometry args={[1, 40, 20]} />
        <meshPhysicalMaterial color="#6e2a26" roughness={0.45} clearcoat={0.5} clearcoatRoughness={0.35} />
      </mesh>
      <primitive
        object={instance}
        position={HEPATOBILIARY_ANATOMY.position}
        rotation={HEPATOBILIARY_ANATOMY.rotation}
        scale={HEPATOBILIARY_ANATOMY.scale}
      />
    </group>
  );
}

export function preloadSurgicalAnatomy() {
  useGLTF.preload(HEPATOBILIARY_ANATOMY.url, false, false);
}

preloadSurgicalAnatomy();

export default SurgicalAnatomy;
