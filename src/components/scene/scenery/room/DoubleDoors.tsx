import { M } from "./materials";
import { box, cyl, group, type V3 } from "./primitives";

/** Hospital double doors with vision panels, kick plates, "in use" sign and push-pad actuator. */
export function buildDoubleDoors(position: V3) {
  const g = group([], { position, name: "double-doors" });
  [-1, 1].forEach((s) =>
    g.add(
      box([0.08, 2.55, 0.1], M.steelDark, { position: [s * 1.0, 1.275, 0.05] }),
    ),
  );
  g.add(box([2.08, 0.1, 0.1], M.steelDark, { position: [0, 2.6, 0.05] }));
  [-1, 1].forEach((s) =>
    g.add(
      group(
        [
          box([0.94, 2.45, 0.05], M.door, {
            position: [0, 1.245, 0],
            receive: true,
          }),
          box([0.34, 0.6, 0.054], M.trim, { position: [-s * 0.16, 1.68, 0] }),
          box([0.29, 0.55, 0.058], M.glass, { position: [-s * 0.16, 1.68, 0] }),
          box([0.9, 0.3, 0.056], M.steel, { position: [0, 0.17, 0] }),
          box([0.12, 0.32, 0.06], M.steel, { position: [-s * 0.36, 1.1, 0] }),
        ],

        { position: [s * 0.48, 0, 0.045] },
      ),
    ),
  );
  g.add(box([0.64, 0.17, 0.03], M.bezel, { position: [0, 2.82, 0.04] }));
  g.add(box([0.5, 0.07, 0.035], M.ledRed, { position: [0, 2.82, 0.045] }));
  g.add(box([0.32, 0.06, 0.09], M.plasticDark, { position: [0, 2.69, 0.1] }));
  g.add(
    group(
      [
        box([0.14, 0.14, 0.03], M.steel),
        cyl(0.04, 0.012, M.ledBlue, {
          position: [0, 0, 0.02],
          rotation: [Math.PI / 2, 0, 0],
        }),
      ],
      {
        position: [1.4, 1.1, 0.02],
      },
    ),
  );
  return g;
}
