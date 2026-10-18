import { ROOM } from "@/data/scene-layout";
import { M } from "./materials";
import { box, group } from "./primitives";

const PANELS: [number, number][] = [
  [-3.6, -4.4],
  [3.6, -4.4],
  [-3.6, -1.2],
  [3.6, -1.2],
  [-3.6, 2.0],
  [3.6, 2.0],
];

/** Emissive ceiling light panels plus a laminar-flow canopy above the operating table. */
export function buildCeilingFixtures() {
  const y = ROOM.height;
  const g = group([], { name: "ceiling-fixtures" });
  PANELS.forEach(([x, z]) =>
    g.add(
      group(
        [
          box([1.28, 0.04, 0.62], M.seam),
          box([1.18, 0.012, 0.52], M.ceilingLight, {
            position: [0, -0.022, 0],
          }),
        ],
        {
          position: [x, y - 0.02, z],
        },
      ),
    ),
  );
  const canopy = group(
    [
      box([3.3, 0.06, 3.7], M.enamel),
      box([3.06, 0.012, 3.46], M.diffuser, { position: [0, -0.034, 0] }),
    ],
    {
      position: [0, y - 0.03, -0.8],
    },
  );
  [-1, 1].forEach((s) => {
    canopy.add(
      box([3.2, 0.014, 0.05], M.ceilingLight, {
        position: [0, -0.036, s * 1.79],
      }),
    );
    canopy.add(
      box([0.05, 0.014, 3.6], M.ceilingLight, {
        position: [s * 1.6, -0.036, 0],
      }),
    );
  });
  [-0.75, 0, 0.75].forEach((z) =>
    canopy.add(box([3.06, 0.016, 0.02], M.seam, { position: [0, -0.04, z] })),
  );
  g.add(canopy);
  return g;
}
