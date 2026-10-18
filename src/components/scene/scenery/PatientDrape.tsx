import * as THREE from "three";
import { TABLE_CENTER_Z } from "@/data/scene-layout";
import { M } from "./room/materials";
import { box, cyl, group, mesh } from "./room/primitives";

const C = TABLE_CENTER_Z;
/** Fenestration (drape opening) framing the training pad — matches the training-field pad in world space. */
const FEN = { x: 0.82, zNear: 0.36, zFar: -0.9, y: 1.214, strip: 0.08 };

/** Draped patient: body mounds, fenestrated drape, side drapes, ether screen and arm boards. */
export function buildPatientDrape() {
  const g = group([], { name: "patient-drape" });
  g.add(
    box([2.02, 0.03, 3.3], M.drape, {
      position: [0, 1.193, C + 0.05],
      receive: true,
    }),
  );
  [-1, 1].forEach((s) =>
    g.add(
      box([0.02, 0.56, 3.3], M.drape, {
        position: [s * 1.02, 0.93, C + 0.05],
        receive: true,
      }),
    ),
  );
  g.add(
    box([2.02, 0.56, 0.02], M.drape, {
      position: [0, 0.93, C + 1.71],
      receive: true,
    }),
  );
  [-0.6, -0.1, 0.45].forEach((x) =>
    g.add(
      box([0.05, 0.52, 0.025], M.drapeFold, { position: [x, 0.93, C + 1.715] }),
    ),
  );

  const fenDepth = FEN.zNear - FEN.zFar;
  const fenMid = (FEN.zNear + FEN.zFar) / 2;
  const wide = FEN.x * 2 + FEN.strip * 2;
  g.add(
    box([wide, 0.012, FEN.strip], M.drapeDark, {
      position: [0, FEN.y, FEN.zNear + FEN.strip / 2],
      receive: true,
    }),
  );
  g.add(
    box([wide, 0.012, FEN.strip], M.drapeDark, {
      position: [0, FEN.y, FEN.zFar - FEN.strip / 2],
      receive: true,
    }),
  );
  [-1, 1].forEach((s) =>
    g.add(
      box([FEN.strip, 0.012, fenDepth], M.drapeDark, {
        position: [s * (FEN.x + FEN.strip / 2), FEN.y, fenMid],
        receive: true,
      }),
    ),
  );

  g.add(
    mesh(new THREE.SphereGeometry(1, 20, 12), M.drape, {
      position: [0, 1.2, -1.22],
      scale: [0.66, 0.11, 0.3],
      cast: true,
      receive: true,
    }),
  );
  [-0.28, 0.28].forEach((x) =>
    g.add(
      mesh(new THREE.SphereGeometry(1, 16, 10), M.drape, {
        position: [x, 1.2, 0.78],
        scale: [0.24, 0.08, 0.36],
        cast: true,
        receive: true,
      }),
    ),
  );

  [-1, 1].forEach((s) =>
    g.add(cyl(0.016, 0.72, M.chrome, { position: [s * 1.05, 1.34, -1.52] })),
  );
  g.add(
    cyl(0.016, 2.14, M.chrome, {
      position: [0, 1.69, -1.52],
      rotation: [0, 0, Math.PI / 2],
    }),
  );
  g.add(
    box([2.04, 0.46, 0.02], M.drape, {
      position: [0, 1.45, -1.53],
      cast: true,
      receive: true,
    }),
  );
  [-0.7, -0.2, 0.3, 0.75].forEach((x) =>
    g.add(
      box([0.05, 0.44, 0.025], M.drapeFold, { position: [x, 1.45, -1.525] }),
    ),
  );

  [-1, 1].forEach((s) =>
    g.add(
      group(
        [
          box([0.64, 0.05, 0.22], M.steel, {
            position: [0, 1.08, 0],
            cast: true,
          }),
          box([0.6, 0.05, 0.2], M.mattress, { position: [0, 1.13, 0] }),
          mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.58, 12), M.drape, {
            position: [0, 1.2, 0],
            rotation: [0, 0, Math.PI / 2],
            cast: true,
          }),
        ],

        { position: [s * 1.32, 0, -1.2] },
      ),
    ),
  );
  return g;
}
