import { Material, Mesh, MeshStandardMaterial, type Object3D } from "three";

export const ORGAN_IDS = [
  "liver",
  "gallbladder",
  "cystic-duct",
  "bile-duct",
  "hepatic-artery",
  "portal-vein",
] as const;
export type OrganId = (typeof ORGAN_IDS)[number];

const ORGAN_PATTERNS: readonly [RegExp, OrganId][] = [
  [/\bgall ?bladder\b/, "gallbladder"],
  [/\bcystic duct\b/, "cystic-duct"],
  [/\b(common )?(bile|hepatic) ducts?\b/, "bile-duct"],
  [/\b(common |proper |cystic )?hepatic artery\b|\bhepatic artery proper\b|\bcystic artery\b/, "hepatic-artery"],
  [/\b(hepatic )?portal vein\b/, "portal-vein"],
  [/\bliver\b|\bhepat(ic|ovenous) segment\b|\bcaudate lobe\b/, "liver"],
];

/**
 * Maps a GLB node/mesh name (e.g. "liver", "Cystic_Duct", "common_hepatic_duct.001", "Gall Bladder_1")
 * to a canonical organ id, or null for unrelated meshes.
 */
export function normalizeOrganName(name: string): OrganId | null {
  const key = name
    .toLowerCase()
    .replace(/[._-]\d+$/, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
  for (const [pattern, organ] of ORGAN_PATTERNS) if (pattern.test(key)) return organ;
  return null;
}

/** Groups every mesh in the scene by organ. Unnamed meshes inherit the nearest named ancestor's organ. */
export function buildOrganMap(scene: Object3D): Map<OrganId, Mesh[]> {
  const organs = new Map<OrganId, Mesh[]>();
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    let organ: OrganId | null = null;
    for (let node: Object3D | null = child; node && !organ; node = node.parent) {
      organ = normalizeOrganName(node.name);
    }
    if (!organ) return;
    const meshes = organs.get(organ) ?? [];
    meshes.push(child);
    organs.set(organ, meshes);
  });
  return organs;
}

/**
 * Deep-clones a loaded GLTF scene and its materials so highlighting never mutates the cached
 * useGLTF scene shared by other views. Geometry stays shared (it is never modified).
 */
export function cloneSceneWithMaterials<T extends Object3D>(scene: T): T {
  const clone = scene.clone(true) as T;
  clone.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material: Material) => material.clone())
      : (child.material as Material).clone();
  });
  return clone;
}

export function disposeClonedMaterials(scene: Object3D) {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
  });
}

export const ORGAN_HIGHLIGHT = { color: "#27c2ff", intensity: 0.35 } as const;

/** Emissive highlight. Call only on meshes whose materials were cloned with cloneSceneWithMaterials. */
export function highlightOrgan(meshes: readonly Mesh[], active: boolean) {
  for (const mesh of meshes) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.emissive.set(active ? ORGAN_HIGHLIGHT.color : "#000000");
      material.emissiveIntensity = active ? ORGAN_HIGHLIGHT.intensity : 0;
    }
  }
}
