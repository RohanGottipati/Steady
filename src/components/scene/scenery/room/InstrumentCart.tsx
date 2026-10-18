import { M } from "./materials";
import { box, cyl, group } from "./primitives";

const DRAWERS = [
  { y: 0.9, label: M.supplyBlue },
  { y: 0.74, label: M.gasYellow },
  { y: 0.58, label: M.gasGreen },
  { y: 0.42, label: M.red },
  { y: 0.24, label: M.supplyBlue },
];

/** Color-coded rolling supply cart. */
export function buildInstrumentCart() {
  const g = group([], {
    name: "instrument-cart",
    position: [-2.35, 0, -0.45],
    rotation: [0, 0.45, 0],
  });
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      g.add(
        cyl(0.04, 0.03, M.rubber, {
          position: [sx * 0.32, 0.04, sz * 0.2],
          rotation: [Math.PI / 2, 0, 0],
        }),
      ),
    ),
  );
  g.add(
    box([0.78, 0.94, 0.5], M.enamelCool, {
      position: [0, 0.55, 0],
      cast: true,
      receive: true,
    }),
  );
  DRAWERS.forEach((d) => {
    g.add(
      box([0.72, 0.006, 0.005], M.seam, { position: [0, d.y - 0.07, 0.252] }),
    );
    g.add(box([0.12, 0.04, 0.01], d.label, { position: [0, d.y, 0.255] }));
  });
  g.add(
    box([0.82, 0.04, 0.54], M.steel, { position: [0, 1.04, 0], receive: true }),
  );
  g.add(
    cyl(0.014, 0.4, M.chrome, {
      position: [0.43, 0.9, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  g.add(
    box([0.26, 0.12, 0.13], M.supplyBlue, {
      position: [-0.2, 1.12, 0],
      cast: true,
    }),
  );
  g.add(
    box([0.2, 0.08, 0.14], M.supplyWhite, {
      position: [0.14, 1.1, 0.05],
      cast: true,
    }),
  );
  return g;
}
