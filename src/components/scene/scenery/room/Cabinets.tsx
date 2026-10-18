import { ROOM, ROOM_BOUNDS } from "@/data/scene-layout";
import { buildCabinetRun } from "./CabinetRun";
import { M } from "./materials";
import { box, group } from "./primitives";

/** Back-wall and right-wall cabinetry with countertop supplies. */
export function buildCabinetry() {
  const backFace = ROOM_BOUNDS.backZ + ROOM.wall / 2;
  const rightFace = ROOM_BOUNDS.rightX - ROOM.wall / 2;
  const g = group([], { name: "cabinetry" });
  g.add(
    buildCabinetRun({
      count: 7,
      position: [-0.4, 0, backFace],
      upper: [true, true, false, false, false, true, true],
    }),
  );
  g.add(
    buildCabinetRun({
      count: 5,
      position: [rightFace, 0, -2.4],
      rotation: [0, -Math.PI / 2, 0],
      upper: [false, true, true, true, false],
    }),
  );
  g.add(
    group(
      [
        box([0.3, 0.16, 0.22], M.supplyBlue, {
          position: [-2.1, 0.08, 0],
          cast: true,
        }),
        box([0.3, 0.16, 0.22], M.supplyBlue, {
          position: [-1.75, 0.08, 0],
          cast: true,
        }),
        box([0.26, 0.1, 0.2], M.supplyWhite, {
          position: [-1.4, 0.05, 0.02],
          cast: true,
        }),
        box([0.36, 0.06, 0.26], M.gownPack, {
          position: [1.6, 0.03, 0],
          cast: true,
        }),
        box([0.36, 0.06, 0.26], M.linen, {
          position: [1.6, 0.09, 0],
          cast: true,
        }),
      ],

      { position: [-0.4, 1.0, backFace + 0.32] },
    ),
  );
  return g;
}
