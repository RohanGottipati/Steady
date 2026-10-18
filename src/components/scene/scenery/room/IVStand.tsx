import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

/** Five-leg IV pole with fluid bag, drip chamber, line to the patient and a clamped infusion pump. */
export function buildIVStand() {
  const g = group([], { name: "iv-stand", position: [-1.32, 0, -2.0] });
  for (let i = 0; i < 5; i++) {
    g.add(
      group(
        [
          box([0.32, 0.03, 0.04], M.steelDark, { position: [0.16, 0.08, 0] }),
          cyl(0.028, 0.035, M.rubber, {
            position: [0.31, 0.03, 0],
            rotation: [Math.PI / 2, 0, 0],
          }),
        ],
        {
          rotation: [0, (i / 5) * Math.PI * 2, 0],
        },
      ),
    );
  }
  g.add(cyl(0.016, 2.1, M.chrome, { position: [0, 1.12, 0], cast: true }));
  g.add(box([0.38, 0.015, 0.015], M.chrome, { position: [0, 2.15, 0] }));
  g.add(box([0.17, 0.26, 0.045], M.ivBag, { position: [0.14, 1.97, 0] }));
  g.add(box([0.13, 0.15, 0.035], M.ivFluid, { position: [0.14, 1.93, 0] }));
  g.add(cyl(0.013, 0.07, M.glass, { position: [0.14, 1.8, 0] }));
  const line = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.14, 1.76, 0),
    new THREE.Vector3(0.2, 1.48, 0.22),
    new THREE.Vector3(0.28, 1.26, 0.52),
    new THREE.Vector3(0.36, 1.24, 0.72),
  ]);
  g.add(mesh(new THREE.TubeGeometry(line, 20, 0.004, 5, false), M.ivBag));
  g.add(
    group(
      [
        box([0.17, 0.23, 0.12], M.enamel, { cast: true }),
        mesh(new THREE.PlaneGeometry(0.12, 0.06), getScreenMaterial("pump"), {
          position: [0, 0.04, 0.061],
        }),
        box([0.04, 0.12, 0.08], M.steelDark, { position: [0, 0, -0.08] }),
      ],

      { position: [0, 1.28, 0.08] },
    ),
  );
  return g;
}
