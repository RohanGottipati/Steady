import * as THREE from "three";

/**
 * Shared, module-level materials for all static OR scenery.
 * Re-using a handful of materials keeps shader programs and GPU state changes minimal.
 */
const std = (p: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial(p);
const basic = (color: string) =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false });

export const M = {
  // Shell
  floor: std({ color: "#b7c3ca", roughness: 0.4, metalness: 0.04 }),
  floorInset: std({ color: "#9db0bb", roughness: 0.42, metalness: 0.03 }),
  wall: std({ color: "#e7ecef", roughness: 0.82 }),
  wallSide: std({ color: "#e1e8ec", roughness: 0.84 }),
  wallAccent: std({ color: "#cfdfe8", roughness: 0.7 }),
  ceiling: std({ color: "#f0f3f5", roughness: 0.9 }),
  trim: std({ color: "#7f8f99", roughness: 0.55 }),
  seam: std({ color: "#b6c1c7", roughness: 0.7 }),
  door: std({ color: "#d6dfe4", roughness: 0.55, metalness: 0.05 }),
  glass: std({
    color: "#a9c3d1",
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
  }),

  // Metals & finishes
  steel: std({ color: "#c3ccd2", metalness: 0.72, roughness: 0.28 }),
  steelDark: std({ color: "#8b979f", metalness: 0.68, roughness: 0.34 }),
  chrome: std({ color: "#e2e7ea", metalness: 0.9, roughness: 0.16 }),
  enamel: std({ color: "#e6ebee", metalness: 0.1, roughness: 0.46 }),
  enamelCool: std({ color: "#d3e0e8", metalness: 0.1, roughness: 0.48 }),
  plasticDark: std({ color: "#252d33", roughness: 0.62 }),
  plasticMid: std({ color: "#3a454d", roughness: 0.55 }),
  rubber: std({ color: "#1c2125", roughness: 0.92 }),
  bezel: std({ color: "#14191d", roughness: 0.42, metalness: 0.2 }),

  // Textiles
  drape: std({ color: "#2b6f86", roughness: 0.93 }),
  drapeDark: std({ color: "#225a6d", roughness: 0.95 }),
  drapeFold: std({ color: "#1f5263", roughness: 0.95 }),
  mattress: std({ color: "#1f3440", roughness: 0.8 }),
  linen: std({ color: "#eef2f4", roughness: 0.95 }),
  gownPack: std({ color: "#5d8fb0", roughness: 0.9 }),

  // Fluids, bins, accents
  ivBag: std({
    color: "#e8f2f6",
    transparent: true,
    opacity: 0.55,
    roughness: 0.2,
  }),
  ivFluid: std({
    color: "#cfe6f0",
    transparent: true,
    opacity: 0.7,
    roughness: 0.15,
  }),
  red: std({ color: "#c8443a", roughness: 0.5 }),
  yellow: std({ color: "#e2b11c", roughness: 0.5 }),
  violet: std({ color: "#7b5ab8", roughness: 0.5 }),
  gasGreen: std({ color: "#2f9a5f", roughness: 0.45 }),
  gasYellow: std({ color: "#e1b621", roughness: 0.45 }),
  gasWhite: std({ color: "#f3f5f6", roughness: 0.45 }),
  gasBlue: std({ color: "#2d68b5", roughness: 0.45 }),
  supplyBlue: std({ color: "#6a9fc6", roughness: 0.7 }),
  supplyWhite: std({ color: "#f1f4f6", roughness: 0.75 }),

  // Emissive
  ceilingLight: std({
    color: "#ffffff",
    emissive: "#eef6ff",
    emissiveIntensity: 1.15,
  }),
  diffuser: std({
    color: "#f5f8fa",
    emissive: "#e8f2fa",
    emissiveIntensity: 0.38,
    roughness: 0.6,
  }),
  lensWarm: std({
    color: "#fff8ec",
    emissive: "#ffe9c4",
    emissiveIntensity: 1.4,
  }),
  ledWarm: std({ color: "#fffaf0", emissive: "#fff1d6", emissiveIntensity: 3 }),
  ledBlue: basic("#5ab8ff"),
  ledGreen: basic("#3ef08a"),
  ledRed: basic("#ff4b4b"),
  ledAmber: basic("#ffb648"),
};
