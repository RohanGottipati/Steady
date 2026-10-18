import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

const CORNERS: [number, number][] = [
  [-0.27, -0.24],
  [0.27, -0.24],
  [-0.27, 0.24],
  [0.27, 0.24],
];

/** Laparoscopic video tower: shelved cart with camera/light/insufflator units and an endoscope monitor. */
export function buildLaparoscopicTower() {
  const g = group([], {
    name: "laparoscopic-tower",
    position: [2.05, 0, -2.15],
    rotation: [0, -0.5, 0],
  });
  CORNERS.forEach(([x, z]) => {
    g.add(
      cyl(0.045, 0.035, M.rubber, {
        position: [x, 0.045, z],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
    g.add(cyl(0.018, 1.36, M.chrome, { position: [x, 0.84, z] }));
  });
  g.add(
    box([0.64, 0.08, 0.58], M.plasticMid, {
      position: [0, 0.12, 0],
      cast: true,
    }),
  );
  [0.44, 0.76, 1.06, 1.38].forEach((y) =>
    g.add(
      box([0.62, 0.025, 0.56], M.plasticDark, {
        position: [0, y, 0],
        receive: true,
      }),
    ),
  );
  g.add(
    box([0.52, 0.17, 0.44], M.enamel, { position: [0, 0.545, 0], cast: true }),
  );
  g.add(
    box([0.16, 0.05, 0.005], M.ledGreen, { position: [-0.12, 0.56, 0.223] }),
  );
  g.add(
    box([0.52, 0.15, 0.44], M.enamel, { position: [0, 0.85, 0], cast: true }),
  );
  g.add(
    cyl(0.022, 0.01, M.ledBlue, {
      position: [0.18, 0.85, 0.224],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  g.add(
    box([0.52, 0.14, 0.44], M.plasticMid, {
      position: [0, 1.145, 0],
      cast: true,
    }),
  );
  g.add(
    box([0.22, 0.03, 0.005], M.ledBlue, { position: [-0.08, 1.15, 0.223] }),
  );
  g.add(cyl(0.03, 0.34, M.steelDark, { position: [0, 1.56, -0.08] }));
  g.add(
    group(
      [
        box([0.96, 0.58, 0.06], M.bezel, { cast: true }),
        mesh(
          new THREE.PlaneGeometry(0.9, 0.52),
          getScreenMaterial("endoscope"),
          { position: [0, 0, 0.031] },
        ),
      ],
      {
        position: [0, 1.92, -0.04],
        rotation: [-0.05, 0, 0],
      },
    ),
  );
  g.add(cyl(0.07, 0.55, M.gasWhite, { position: [0.2, 0.75, -0.36] }));
  g.add(cyl(0.05, 0.06, M.steelDark, { position: [0.2, 1.05, -0.36] }));
  return g;
}
