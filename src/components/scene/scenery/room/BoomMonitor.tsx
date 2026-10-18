import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

/** Ceiling boom with a patient-vitals monitor angled toward the surgeon. */
export function buildBoomMonitor() {
  const g = group([], { name: "boom-monitor" });
  g.add(
    cyl(0.14, 0.1, M.enamel, { position: [-2.15, 3.95, -2.5], segments: 18 }),
  );
  g.add(cyl(0.06, 0.7, M.enamel, { position: [-2.15, 3.55, -2.5] }));
  g.add(
    box([0.9, 0.08, 0.09], M.enamel, {
      position: [-1.815, 3.2, -2.2],
      rotation: [0, -Math.atan2(0.6, 0.67), 0],
    }),
  );
  g.add(cyl(0.055, 0.1, M.steelDark, { position: [-1.48, 3.2, -1.9] }));
  g.add(cyl(0.03, 0.87, M.enamel, { position: [-1.48, 2.765, -1.9] }));
  g.add(
    group(
      [
        box([1.0, 0.62, 0.07], M.bezel, { cast: true }),
        box([0.42, 0.3, 0.06], M.plasticDark, { position: [0, 0, -0.06] }),
        box([0.1, 0.1, 0.08], M.steelDark, { position: [0, 0.25, -0.1] }),
        mesh(new THREE.PlaneGeometry(0.94, 0.56), getScreenMaterial("vitals"), {
          position: [0, 0.01, 0.0355],
        }),
        box([0.03, 0.012, 0.005], M.ledGreen, {
          position: [0.44, -0.296, 0.036],
        }),
      ],

      { position: [-1.48, 1.98, -1.9], rotation: [-0.06, 0.37, 0] },
    ),
  );
  return g;
}
