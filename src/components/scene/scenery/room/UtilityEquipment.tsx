import { M } from "./materials";
import { box, cyl, group } from "./primitives";

/** Floor-standing utility items: biohazard bin, linen hamper, kick bucket and step stool. */
export function buildUtilityEquipment() {
  const g = group([], { name: "utility-equipment" });
  g.add(
    group(
      [
        cyl(0.2, 0.56, M.red, {
          radiusBottom: 0.18,
          segments: 18,
          position: [0, 0.28, 0],
          cast: true,
        }),
        cyl(0.21, 0.04, M.plasticDark, {
          segments: 18,
          position: [0, 0.58, 0],
        }),
        box([0.12, 0.12, 0.01], M.yellow, { position: [0, 0.34, 0.195] }),
      ],

      { position: [2.72, 0, -6.05] },
    ),
  );
  const hamper = group([], { position: [-4.1, 0, -5.85] });
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) =>
      hamper.add(
        cyl(0.012, 0.86, M.chrome, { position: [sx * 0.22, 0.45, sz * 0.22] }),
      ),
    ),
  );
  hamper.add(
    box([0.42, 0.56, 0.42], M.gownPack, { position: [0, 0.52, 0], cast: true }),
  );
  hamper.add(box([0.48, 0.03, 0.48], M.steelDark, { position: [0, 0.88, 0] }));
  g.add(hamper);

  const bucket = group(
    [cyl(0.22, 0.025, M.steelDark, { segments: 18, position: [0, 0.1, 0] })],
    { position: [-1.3, 0, 0.35] },
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    bucket.add(
      cyl(0.03, 0.03, M.rubber, {
        position: [Math.cos(a) * 0.2, 0.035, Math.sin(a) * 0.2],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }
  bucket.add(
    cyl(0.2, 0.3, M.steel, {
      radiusBottom: 0.15,
      segments: 20,
      position: [0, 0.27, 0],
      cast: true,
    }),
  );
  g.add(bucket);

  g.add(
    group(
      [
        box([0.52, 0.2, 0.34], M.steel, {
          position: [0, 0.1, 0],
          cast: true,
          receive: true,
        }),
        box([0.48, 0.02, 0.3], M.rubber, { position: [0, 0.21, 0] }),
      ],
      { position: [1.2, 0, 1.05] },
    ),
  );
  return g;
}
