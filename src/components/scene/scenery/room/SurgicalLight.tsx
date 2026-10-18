import * as THREE from "three";
import { M } from "./materials";
import { box, cyl, group, mesh, type V3 } from "./primitives";

interface SurgicalLightOptions {
  hub: V3;
  dome: V3;
  target: V3;
  armDrop?: number;
  intensity?: number;
  castShadow?: boolean;
}

const LED_POSITIONS: [number, number][] = [
  [0, 0],
  ...Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return [Math.cos(a) * 0.22, Math.sin(a) * 0.22] as [number, number];
  }),
];

/** Ceiling-mounted LED surgical light: hub, articulated arm, dome with LED cluster and a focused spotlight. */
export function buildSurgicalLight({
  hub,
  dome,
  target,
  armDrop = 0.6,
  intensity = 8,
  castShadow = false,
}: SurgicalLightOptions) {
  const armY = hub[1] - armDrop;
  const dx = dome[0] - hub[0];
  const dz = dome[2] - hub[2];
  const dir = new THREE.Vector3(
    target[0] - dome[0],
    target[1] - dome[1],
    target[2] - dome[2],
  ).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, -1, 0),
    dir,
  );
  const e = new THREE.Euler().setFromQuaternion(q);
  const dropBottom = dome[1] + 0.2;

  const g = group([], { name: "surgical-light" });
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(...target);
  g.add(spotTarget);

  g.add(
    cyl(0.17, 0.08, M.enamel, {
      position: [hub[0], hub[1] - 0.04, hub[2]],
      segments: 20,
    }),
  );
  g.add(
    cyl(0.045, armDrop, M.enamel, {
      position: [hub[0], hub[1] - armDrop / 2, hub[2]],
    }),
  );
  g.add(
    box([Math.hypot(dx, dz), 0.07, 0.08], M.enamel, {
      position: [hub[0] + dx / 2, armY, hub[2] + dz / 2],
      rotation: [0, -Math.atan2(dz, dx), 0],
    }),
  );
  g.add(cyl(0.06, 0.08, M.steelDark, { position: [dome[0], armY, dome[2]] }));
  g.add(
    cyl(0.032, armY - dropBottom, M.enamel, {
      position: [dome[0], (armY + dropBottom) / 2, dome[2]],
    }),
  );

  const head = group([], { position: dome, rotation: [e.x, e.y, e.z] });
  head.add(cyl(0.03, 0.2, M.steelDark, { position: [0, 0.16, 0] }));
  head.add(
    cyl(0.34, 0.14, M.enamel, { radiusBottom: 0.44, segments: 32, cast: true }),
  );
  head.add(
    mesh(new THREE.TorusGeometry(0.44, 0.022, 8, 40), M.steel, {
      position: [0, -0.07, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  head.add(
    mesh(new THREE.CircleGeometry(0.41, 40), M.lensWarm, {
      position: [0, -0.071, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );
  LED_POSITIONS.forEach(([x, z]) =>
    head.add(
      mesh(new THREE.CircleGeometry(0.075, 20), M.ledWarm, {
        position: [x, -0.074, z],
        rotation: [Math.PI / 2, 0, 0],
      }),
    ),
  );
  head.add(cyl(0.035, 0.16, M.steel, { position: [0, -0.15, 0] }));

  const spot = new THREE.SpotLight("#fff3dc", intensity, 7, 0.42, 0.65, 2);
  spot.position.set(0, -0.12, 0);
  spot.target = spotTarget;
  spot.castShadow = castShadow;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  head.add(spot);
  g.add(head);
  return g;
}
