import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";

const INSTRUMENTS = [
  { x: -0.24, len: 0.2, gold: false },
  { x: -0.15, len: 0.22, gold: true },
  { x: -0.06, len: 0.18, gold: false },
  { x: 0.03, len: 0.2, gold: false },
  { x: 0.12, len: 0.16, gold: true },
];

/** Draped Mayo stand with hemostats and needle drivers laid out beside the surgeon. */
export function buildMayoStand() {
  const g = group([], {
    name: "mayo-stand",
    position: [1.42, 0, -0.32],
    rotation: [0, -0.2, 0],
  });
  [-1, 1].forEach((s) => {
    g.add(
      box([0.06, 0.04, 0.72], M.steelDark, { position: [s * 0.26, 0.07, 0] }),
    );
    [-1, 1].forEach((t) =>
      g.add(
        cyl(0.035, 0.03, M.rubber, {
          position: [s * 0.26, 0.035, t * 0.33],
          rotation: [Math.PI / 2, 0, 0],
        }),
      ),
    );
  });
  g.add(box([0.58, 0.04, 0.06], M.steelDark, { position: [0, 0.07, -0.33] }));
  g.add(
    cyl(0.028, 1.06, M.chrome, { position: [0.26, 0.6, -0.3], cast: true }),
  );
  g.add(box([0.04, 0.04, 0.32], M.chrome, { position: [0.26, 1.11, -0.16] }));
  g.add(
    box([0.74, 0.025, 0.48], M.steel, {
      position: [0, 1.13, 0],
      cast: true,
      receive: true,
    }),
  );
  g.add(
    box([0.78, 0.012, 0.52], M.drape, {
      position: [0, 1.148, 0],
      receive: true,
    }),
  );
  g.add(box([0.78, 0.24, 0.012], M.drape, { position: [0, 1.03, 0.26] }));
  g.add(
    box([0.24, 0.03, 0.16], M.linen, {
      position: [0.24, 1.17, 0.08],
      cast: true,
    }),
  );
  INSTRUMENTS.forEach((i) => {
    const item = group(
      [
        box([0.012, 0.008, i.len], M.chrome, {
          position: [0, 0, -0.03],
          cast: true,
        }),
      ],
      { position: [i.x, 1.16, -0.02] },
    );
    [-1, 1].forEach((s) =>
      item.add(
        mesh(
          new THREE.TorusGeometry(0.018, 0.004, 6, 12),
          i.gold ? M.yellow : M.chrome,
          {
            position: [s * 0.02, 0, i.len / 2 - 0.01],
            rotation: [-Math.PI / 2, 0, 0],
          },
        ),
      ),
    );
    g.add(item);
  });
  return g;
}
