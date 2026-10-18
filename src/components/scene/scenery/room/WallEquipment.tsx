import * as THREE from "three";
import { ROOM, ROOM_BOUNDS } from "@/data/scene-layout";
import { M } from "./materials";
import { box, cyl, group, mesh } from "./primitives";
import { getScreenMaterial } from "./screenTextures";

/** Wall-mounted equipment: PACS display, clock, medical gas panel, sharps, glove dispensers and the OR status board. */
export function buildWallEquipment() {
  const backFace = ROOM_BOUNDS.backZ + ROOM.wall / 2;
  const rightFace = ROOM_BOUNDS.rightX - ROOM.wall / 2;
  const g = group([], { name: "wall-equipment" });

  g.add(
    group(
      [
        box([1.72, 0.98, 0.05], M.bezel),
        mesh(new THREE.PlaneGeometry(1.64, 0.9), getScreenMaterial("pacs"), {
          position: [0, 0, 0.026],
        }),
      ],
      { position: [-0.4, 2.22, backFace + 0.03] },
    ),
  );
  g.add(
    group(
      [
        cyl(0.21, 0.05, M.trim, {
          rotation: [Math.PI / 2, 0, 0],
          segments: 28,
        }),
        mesh(new THREE.CircleGeometry(0.19, 28), getScreenMaterial("clock"), {
          position: [0, 0, 0.027],
        }),
      ],
      { position: [-0.4, 3.22, backFace + 0.03] },
    ),
  );

  const gas = group([box([1.0, 0.36, 0.04], M.steel)], {
    position: [-4.5, 1.5, backFace + 0.02],
  });
  [
    [-0.33, M.gasGreen],
    [-0.11, M.gasYellow],
    [0.11, M.gasWhite],
    [0.33, M.gasBlue],
  ].forEach(([x, m]) =>
    gas.add(
      group(
        [
          cyl(0.045, 0.025, m as THREE.Material, {
            rotation: [Math.PI / 2, 0, 0],
          }),
          box([0.12, 0.03, 0.005], M.plasticDark, { position: [0, -0.11, 0] }),
        ],
        {
          position: [x as number, 0.02, 0.03],
        },
      ),
    ),
  );
  gas.add(
    group(
      [
        cyl(0.075, 0.22, M.glass),
        cyl(0.07, 0.08, M.ivFluid, { position: [0, -0.06, 0] }),
        box([0.03, 0.25, 0.03], M.steelDark, { position: [0, 0.2, -0.05] }),
      ],
      {
        position: [-0.33, -0.36, 0.08],
      },
    ),
  );
  gas.add(
    group(
      [
        cyl(0.022, 0.16, M.glass),
        box([0.03, 0.12, 0.03], M.gasGreen, { position: [0, 0.12, -0.03] }),
      ],
      { position: [0.11, -0.3, 0.07] },
    ),
  );
  g.add(gas);

  g.add(
    group(
      [
        box([0.24, 0.32, 0.14], M.red, { cast: true }),
        box([0.24, 0.05, 0.14], M.yellow, { position: [0, 0.18, 0] }),
        box([0.28, 0.04, 0.03], M.steelDark, { position: [0, -0.12, -0.06] }),
      ],

      { position: [-3.55, 1.3, backFace + 0.08] },
    ),
  );
  for (let i = 0; i < 3; i++) {
    g.add(
      group(
        [
          box([0.28, 0.14, 0.1], i === 1 ? M.supplyWhite : M.supplyBlue),
          box([0.12, 0.02, 0.005], M.plasticDark, {
            position: [0, -0.04, 0.05],
          }),
        ],
        {
          position: [-4.85 + i * 0.32, 2.1, backFace + 0.06],
        },
      ),
    );
  }
  g.add(
    group(
      [
        box([1.62, 1.02, 0.05], M.bezel),
        mesh(new THREE.PlaneGeometry(1.54, 0.94), getScreenMaterial("status"), {
          position: [0, 0, 0.026],
        }),
      ],
      {
        position: [rightFace - 0.03, 1.95, 0.2],
        rotation: [0, -Math.PI / 2, 0],
      },
    ),
  );
  g.add(
    group(
      [
        box([0.12, 0.2, 0.08], M.supplyWhite),
        box([0.05, 0.03, 0.04], M.steelDark, { position: [0, -0.1, 0.03] }),
      ],
      { position: [3.0, 1.35, backFace + 0.05] },
    ),
  );
  return g;
}
