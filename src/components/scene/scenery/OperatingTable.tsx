import { TABLE_CENTER_Z } from "@/data/scene-layout";
import { buildPatientDrape } from "./PatientDrape";
import { M } from "./room/materials";
import { box, group } from "./room/primitives";

const C = TABLE_CENTER_Z;
const SECTIONS: [number, number][] = [
  [0.55, -1.56],
  [1.24, -0.66],
  [0.9, 0.44],
  [0.9, 1.37],
];

/**
 * Operating table — the scene's centerpiece. Its group sits at the world origin so the training field
 * added as a child keeps its world transform (TRAINING_FIELD) unchanged.
 */
export function buildOperatingTable() {
  const g = group([], { name: "operating-table" });
  g.add(
    box([0.92, 0.16, 1.5], M.steelDark, {
      position: [0, 0.08, C],
      cast: true,
      receive: true,
    }),
  );
  g.add(
    box([0.86, 0.04, 1.44], M.enamel, {
      position: [0, 0.18, C],
      receive: true,
    }),
  );
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      g.add(
        box([0.16, 0.04, 0.16], M.rubber, {
          position: [sx * 0.36, 0.02, C + sz * 0.62],
        }),
      ),
    ),
  );
  g.add(
    box([0.46, 0.7, 0.56], M.enamel, { position: [0, 0.55, C], cast: true }),
  );
  g.add(box([0.4, 0.08, 0.5], M.chrome, { position: [0, 0.94, C] }));
  g.add(
    box([1.6, 0.08, 3.2], M.steelDark, { position: [0, 0.95, C], cast: true }),
  );
  SECTIONS.forEach(([len, z]) => {
    g.add(
      box([1.92, 0.1, len], M.steel, {
        position: [0, 1.02, C + z],
        cast: true,
        receive: true,
      }),
    );
    g.add(
      box([1.86, 0.11, len - 0.02], M.mattress, {
        position: [0, 1.125, C + z],
        receive: true,
      }),
    );
  });
  [-1, 1].forEach((s) => {
    g.add(
      box([0.03, 0.035, 3.5], M.chrome, { position: [s * 0.995, 1.02, C] }),
    );
    [-1.4, -0.6, 0.2, 1.0].forEach((z) =>
      g.add(
        box([0.05, 0.05, 0.08], M.steelDark, {
          position: [s * 0.98, 1.02, C + z],
        }),
      ),
    );
  });
  g.add(buildPatientDrape());
  return g;
}
