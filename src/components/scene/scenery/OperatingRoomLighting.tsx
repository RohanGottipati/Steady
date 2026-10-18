import * as THREE from "three";

/**
 * Global OR lighting: cool hemisphere fill + one shadow-casting key + ceiling-panel point lights.
 * Focused warm light over the patient comes from the surgical-light spotlights.
 */
export function buildOperatingRoomLighting(shadows: boolean) {
  const g = new THREE.Group();
  g.name = "or-lighting";
  g.add(new THREE.HemisphereLight("#f1f6fa", "#8a98a1", 0.8));
  g.add(new THREE.AmbientLight("#eaf2f7", 0.2));
  const key = new THREE.DirectionalLight("#f7fbff", 1.0);
  key.position.set(3.5, 6.5, 3);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    near: 1,
    far: 16,
    left: -4.5,
    right: 4.5,
    top: 4.5,
    bottom: -4.5,
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.add(key);
  const fill = new THREE.DirectionalLight("#dcecff", 0.3);
  fill.position.set(-4, 3, -3);
  g.add(fill);
  (
    [
      [-3.6, 3.7, 2.0, 6, 9],
      [3.6, 3.7, -4.4, 6, 9],
      [0, 3.5, -5.2, 4, 7],
    ] as const
  ).forEach(([x, y, z, intensity, distance]) => {
    const p = new THREE.PointLight("#eef6ff", intensity, distance, 2);
    p.position.set(x, y, z);
    g.add(p);
  });
  return g;
}
