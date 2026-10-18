import * as THREE from "three";
import { ROOM, ROOM_BOUNDS } from "@/data/scene-layout";
import { buildCeilingFixtures } from "./CeilingFixtures";
import { buildDoubleDoors } from "./DoubleDoors";
import { M } from "./materials";
import { box, group } from "./primitives";

/** Enclosed OR: floor, walls, ceiling, wall protection, baseboards, doors and ceiling lights. */
export function buildRoomShell() {
  const { width: W, depth: D, height: H, wall: T, centerZ: CZ } = ROOM;
  const { backZ, frontZ } = ROOM_BOUNDS;
  const backFace = backZ + T / 2;
  const g = group([], { name: "room-shell" });

  g.add(box([W, 0.1, D], M.floor, { position: [0, -0.05, CZ], receive: true }));
  g.add(
    box([4.6, 0.006, 6.2], M.floorInset, {
      position: [0, 0.003, -0.9],
      receive: true,
    }),
  );
  const grid = new THREE.GridHelper(12, 24, "#a7b4bb", "#adb9bf");
  grid.position.set(0, 0.007, CZ);
  g.add(grid);

  g.add(box([W, H, T], M.wall, { position: [0, H / 2, backZ], receive: true }));
  [-1, 1].forEach((s) =>
    g.add(
      box([T, H, D], M.wallSide, {
        position: [(s * W) / 2, H / 2, CZ],
        receive: true,
      }),
    ),
  );
  g.add(
    box([W / 2 - 1.2, H, T], M.wallSide, {
      position: [-(W / 4 + 0.6), H / 2, frontZ],
    }),
  );
  g.add(
    box([W / 2 - 1.2, H, T], M.wallSide, {
      position: [W / 4 + 0.6, H / 2, frontZ],
    }),
  );
  g.add(
    box([2.4, H - 2.6, T], M.wallSide, {
      position: [0, 2.6 + (H - 2.6) / 2, frontZ],
    }),
  );
  g.add(box([W, 0.1, D], M.ceiling, { position: [0, H + 0.05, CZ] }));

  g.add(
    box([W, 0.52, 0.02], M.wallAccent, {
      position: [0, 0.78, backFace + 0.01],
    }),
  );
  g.add(
    box([W, 0.06, 0.05], M.steelDark, {
      position: [0, 1.02, backFace + 0.025],
    }),
  );
  g.add(
    box([W, 0.12, 0.03], M.trim, { position: [0, 0.06, backFace + 0.015] }),
  );
  g.add(
    box([W, 0.05, 0.04], M.seam, { position: [0, H - 0.025, backFace + 0.02] }),
  );
  [-1, 1].forEach((s) => {
    const x = s * (W / 2 - T / 2);
    g.add(
      box([0.02, 0.52, D], M.wallAccent, {
        position: [x - s * 0.01, 0.78, CZ],
      }),
    );
    g.add(
      box([0.05, 0.06, D], M.steelDark, {
        position: [x - s * 0.025, 1.02, CZ],
      }),
    );
    g.add(
      box([0.03, 0.12, D], M.trim, { position: [x - s * 0.015, 0.06, CZ] }),
    );
    g.add(
      box([0.04, 0.05, D], M.seam, { position: [x - s * 0.02, H - 0.025, CZ] }),
    );
  });

  g.add(buildCeilingFixtures());
  g.add(buildDoubleDoors([4.3, 0, backFace]));
  return g;
}
