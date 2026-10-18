import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

/** Ceiling equipment pendant with gas outlets, power and an electrosurgical unit on its shelf. */
export function buildEquipmentBoom() {
  const g = group([], { name: "equipment-boom" });
  g.add(
    cyl(0.16, 0.1, M.enamel, { position: [-2.75, 3.95, -2.15], segments: 18 }),
  );
  g.add(cyl(0.09, 1.7, M.enamel, { position: [-2.75, 3.1, -2.15] }));
  const head = group([], {
    position: [-2.75, 0, -2.15],
    rotation: [0, 0.65, 0],
  });
  head.add(
    box([0.44, 1.25, 0.38], M.enamel, {
      position: [0, 1.67, 0],
      cast: true,
      receive: true,
    }),
  );
  head.add(box([0.44, 0.03, 0.385], M.seam, { position: [0, 2.12, 0] }));
  [
    [-0.11, M.gasGreen],
    [0, M.gasYellow],
    [0.11, M.gasWhite],
  ].forEach(([x, m]) =>
    head.add(
      cyl(0.032, 0.03, m as THREE.Material, {
        position: [x as number, 1.98, 0.2],
        rotation: [Math.PI / 2, 0, 0],
      }),
    ),
  );
  [-0.1, 0.1].forEach((x) =>
    head.add(
      box([0.08, 0.1, 0.02], M.plasticDark, { position: [x, 1.78, 0.195] }),
    ),
  );
  head.add(
    box([0.54, 0.03, 0.46], M.steel, {
      position: [0, 1.2, 0.04],
      receive: true,
    }),
  );
  head.add(
    box([0.4, 0.15, 0.34], M.enamel, { position: [0, 1.29, 0.04], cast: true }),
  );
  head.add(
    mesh(new THREE.PlaneGeometry(0.22, 0.09), getScreenMaterial("esu"), {
      position: [-0.05, 1.3, 0.211],
    }),
  );
  head.add(
    box([0.03, 0.03, 0.01], M.ledBlue, { position: [0.14, 1.3, 0.212] }),
  );
  g.add(head);
  return g;
}
