"use client";
import { useEffect, useMemo } from "react";
import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { tissueTextures } from "./tissue-surface";

export const SKIN_TINT = [222, 170, 150] as const;

/** Per-view skin material; textures are module-cached and therefore not disposed here. */
export function useSkinMaterial(performanceMode: boolean, tint: readonly [number, number, number] = SKIN_TINT, key = "skin") {
  const material = useMemo(() => {
    const textures = tissueTextures(tint, key);
    const shared = {
      color: textures ? "#ffffff" : `rgb(${tint.join(",")})`,
      map: textures?.map ?? null,
      bumpMap: textures?.bump ?? null,
      bumpScale: 1.2,
      roughness: 0.52,
    };
    return performanceMode
      ? new MeshStandardMaterial(shared)
      : new MeshPhysicalMaterial({
          ...shared,
          clearcoat: 0.28,
          clearcoatRoughness: 0.42,
          sheen: 0.35,
          sheenColor: "#ffc1ad",
          sheenRoughness: 0.6,
        });
  }, [performanceMode, tint, key]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
