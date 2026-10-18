import { M } from "./materials";
import { box, group, type V3 } from "./primitives";

interface CabinetRunOptions {
  count: number;
  position: V3;
  rotation?: V3;
  moduleWidth?: number;
  upper?: boolean[];
}

const SUPPLY_COLORS = [M.supplyBlue, M.supplyWhite, M.gownPack, M.supplyWhite];

/** A repeated run of base cabinets with stainless countertop and optional glass-front uppers. Local +Z faces the room. */
export function buildCabinetRun({
  count,
  position,
  rotation = [0, 0, 0],
  moduleWidth = 0.75,
  upper,
}: CabinetRunOptions) {
  const total = count * moduleWidth;
  const start = -total / 2 + moduleWidth / 2;
  const g = group([], { position, rotation, name: "cabinet-run" });
  g.add(box([total, 0.1, 0.52], M.plasticDark, { position: [0, 0.05, 0.27] }));
  for (let i = 0; i < count; i++) {
    const m = group([], { position: [start + i * moduleWidth, 0, 0] });
    m.add(
      box([moduleWidth - 0.02, 0.86, 0.6], M.enamel, {
        position: [0, 0.53, 0.3],
        receive: true,
      }),
    );
    if (i % 3 === 0) {
      [0.84, 0.66, 0.42].forEach((y) =>
        m.add(
          box([moduleWidth - 0.1, 0.006, 0.005], M.seam, {
            position: [0, y, 0.602],
          }),
        ),
      );
      [0.9, 0.73, 0.52].forEach((y) =>
        m.add(box([0.18, 0.02, 0.025], M.chrome, { position: [0, y, 0.615] })),
      );
    } else {
      m.add(box([0.006, 0.8, 0.005], M.seam, { position: [0, 0.53, 0.602] }));
      [-1, 1].forEach((s) =>
        m.add(
          box([0.02, 0.18, 0.025], M.chrome, {
            position: [s * 0.06, 0.8, 0.615],
          }),
        ),
      );
    }
    if (upper?.[i]) {
      m.add(
        box([moduleWidth - 0.02, 0.82, 0.36], M.enamel, {
          position: [0, 2.36, 0.18],
        }),
      );
      m.add(
        box([moduleWidth - 0.12, 0.7, 0.01], M.glass, {
          position: [0, 2.36, 0.365],
        }),
      );
      [2.14, 2.42].forEach((y) => {
        m.add(
          box([moduleWidth - 0.1, 0.012, 0.3], M.steel, {
            position: [0, y, 0.18],
          }),
        );
        SUPPLY_COLORS.forEach((mat, k) =>
          m.add(
            box([0.12, 0.13, 0.2], mat, {
              position: [-0.21 + k * 0.14, y + 0.072, 0.17],
            }),
          ),
        );
      });
    }
    g.add(m);
  }
  g.add(
    box([total + 0.04, 0.04, 0.64], M.steel, {
      position: [0, 0.98, 0.32],
      receive: true,
    }),
  );
  g.add(
    box([total + 0.04, 0.14, 0.02], M.steel, { position: [0, 1.07, 0.01] }),
  );
  return g;
}
