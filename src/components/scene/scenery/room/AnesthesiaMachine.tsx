import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

const CASTERS: [number, number][] = [
  [-0.36, -0.28],
  [0.36, -0.28],
  [-0.36, 0.28],
  [0.36, 0.28],
];

/** Anesthesia workstation: ventilator screen, flowmeters, vaporizers, bellows, circuit and vitals monitor. */
export function buildAnesthesiaMachine() {
  const g = group([], {
    name: "anesthesia-machine",
    position: [-1.8, 0, -3.1],
    rotation: [0, 0.37, 0],
  });
  CASTERS.forEach(([x, z]) =>
    g.add(
      cyl(0.05, 0.04, M.rubber, {
        position: [x, 0.05, z],
        rotation: [Math.PI / 2, 0, 0],
      }),
    ),
  );
  g.add(
    box([0.86, 0.18, 0.7], M.plasticMid, { position: [0, 0.2, 0], cast: true }),
  );
  g.add(
    box([0.82, 0.85, 0.66], M.enamel, {
      position: [0, 0.72, 0],
      cast: true,
      receive: true,
    }),
  );
  [0.52, 0.76, 1.0].forEach((y) => {
    g.add(box([0.74, 0.006, 0.005], M.seam, { position: [0, y, 0.333] }));
    g.add(box([0.2, 0.025, 0.02], M.chrome, { position: [0, y + 0.1, 0.34] }));
  });
  g.add(
    box([0.94, 0.04, 0.74], M.steel, {
      position: [0, 1.17, 0.02],
      receive: true,
    }),
  );
  g.add(
    box([0.74, 0.8, 0.42], M.enamelCool, {
      position: [0, 1.6, -0.12],
      cast: true,
    }),
  );
  g.add(
    group(
      [
        box([0.54, 0.38, 0.04], M.bezel),
        mesh(
          new THREE.PlaneGeometry(0.5, 0.33),
          getScreenMaterial("anesthesia"),
          { position: [0, 0, 0.021] },
        ),
      ],
      {
        position: [0, 1.74, 0.1],
        rotation: [-0.18, 0, 0],
      },
    ),
  );
  [M.gasGreen, M.gasYellow, M.gasBlue].forEach((m, i) => {
    g.add(
      group(
        [
          cyl(0.018, 0.24, M.glass),
          mesh(new THREE.SphereGeometry(0.014, 8, 6), m, {
            position: [0, -0.05 + i * 0.04, 0],
          }),
        ],
        {
          position: [-0.28 + i * 0.06, 1.38, 0.1],
        },
      ),
    );
  });
  g.add(
    box([0.1, 0.2, 0.12], M.yellow, {
      position: [0.12, 1.3, 0.12],
      cast: true,
    }),
  );
  g.add(
    box([0.1, 0.2, 0.12], M.violet, {
      position: [0.24, 1.3, 0.12],
      cast: true,
    }),
  );
  g.add(
    box([0.24, 0.03, 0.24], M.plasticDark, { position: [0.52, 1.2, 0.08] }),
  );
  g.add(cyl(0.085, 0.3, M.glass, { position: [0.52, 1.37, 0.08] }));
  g.add(cyl(0.07, 0.14, M.gasBlue, { position: [0.52, 1.3, 0.08] }));
  const circuit = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.38, 1.3, 0.3),
    new THREE.Vector3(0.62, 1.15, 0.6),
    new THREE.Vector3(0.95, 1.25, 0.95),
    new THREE.Vector3(1.25, 1.32, 1.2),
  ]);
  g.add(mesh(new THREE.TubeGeometry(circuit, 24, 0.022, 8, false), M.gasBlue));
  [-0.18, 0.02].forEach((x) => {
    g.add(cyl(0.075, 0.7, M.gasGreen, { position: [x, 0.65, -0.42] }));
    g.add(cyl(0.075, 0.12, M.gasWhite, { position: [x, 1.06, -0.42] }));
  });
  g.add(cyl(0.025, 0.36, M.steelDark, { position: [0, 2.16, -0.14] }));
  g.add(
    group(
      [
        box([0.62, 0.42, 0.05], M.bezel, { cast: true }),
        mesh(new THREE.PlaneGeometry(0.58, 0.37), getScreenMaterial("vitals"), {
          position: [0, 0, 0.026],
        }),
      ],
      {
        position: [0, 2.42, -0.06],
        rotation: [-0.08, 0, 0],
      },
    ),
  );
  return g;
}
