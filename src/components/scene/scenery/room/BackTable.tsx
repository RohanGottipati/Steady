import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";

const LEGS: [number, number][] = [
  [-0.75, -0.31],
  [0.75, -0.31],
  [-0.75, 0.31],
  [0.75, 0.31],
];

/** Sterile back table: draped stainless top with basins, instrument tray, towels and gown pack. */
export function buildBackTable() {
  const g = group([], {
    name: "back-table",
    position: [2.8, 0, -3.75],
    rotation: [0, -0.14, 0],
  });
  LEGS.forEach(([x, z]) => {
    g.add(cyl(0.02, 0.86, M.chrome, { position: [x, 0.47, z] }));
    g.add(
      cyl(0.035, 0.03, M.rubber, {
        position: [x, 0.03, z],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  });
  g.add(
    box([1.54, 0.02, 0.64], M.steel, { position: [0, 0.26, 0], receive: true }),
  );
  g.add(box([1.6, 0.03, 0.7], M.steel, { position: [0, 0.9, 0] }));
  g.add(
    box([1.68, 0.012, 0.78], M.drape, {
      position: [0, 0.921, 0],
      receive: true,
    }),
  );
  g.add(box([1.68, 0.34, 0.012], M.drape, { position: [0, 0.76, 0.39] }));
  [-1, 1].forEach((s) =>
    g.add(box([0.012, 0.34, 0.78], M.drape, { position: [s * 0.84, 0.76, 0] })),
  );
  g.add(
    cyl(0.17, 0.08, M.steel, {
      radiusBottom: 0.12,
      segments: 20,
      position: [-0.52, 0.967, -0.08],
      cast: true,
    }),
  );
  g.add(
    cyl(0.07, 0.06, M.steel, {
      radiusBottom: 0.05,
      position: [-0.22, 0.958, 0.18],
      cast: true,
    }),
  );
  g.add(
    box([0.52, 0.05, 0.3], M.steel, {
      position: [0.08, 0.952, -0.12],
      cast: true,
    }),
  );
  for (let i = 0; i < 8; i++) {
    g.add(
      mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12), M.chrome, {
        position: [-0.12 + i * 0.058, 0.982, -0.02],
        rotation: [-Math.PI / 2, 0, 0],
      }),
    );
  }
  g.add(
    box([0.28, 0.06, 0.2], M.linen, {
      position: [0.56, 0.957, 0.16],
      cast: true,
    }),
  );
  g.add(
    box([0.3, 0.08, 0.24], M.gownPack, {
      position: [0.56, 0.967, -0.17],
      cast: true,
    }),
  );
  g.add(box([0.24, 0.04, 0.18], M.drapeDark, { position: [-0.1, 0.947, 0.2] }));
  return g;
}
