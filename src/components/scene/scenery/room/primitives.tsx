import * as THREE from "three";

export type V3 = [number, number, number];

export interface PlaceOptions {
  position?: V3;
  rotation?: V3;
  scale?: V3;
  cast?: boolean;
  receive?: boolean;
  name?: string;
}

function place<T extends THREE.Object3D>(obj: T, o: PlaceOptions): T {
  if (o.position) obj.position.set(...o.position);
  if (o.rotation) obj.rotation.set(...o.rotation);
  if (o.scale) obj.scale.set(...o.scale);
  if (o.name) obj.name = o.name;
  obj.castShadow = !!o.cast;
  obj.receiveShadow = !!o.receive;
  return obj;
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  o: PlaceOptions = {},
) {
  return place(new THREE.Mesh(geometry, material), o);
}

export function box(size: V3, material: THREE.Material, o: PlaceOptions = {}) {
  return mesh(new THREE.BoxGeometry(...size), material, o);
}

export function cyl(
  radius: number,
  height: number,
  material: THREE.Material,
  o: PlaceOptions & { radiusBottom?: number; segments?: number } = {},
) {
  return mesh(
    new THREE.CylinderGeometry(
      radius,
      o.radiusBottom ?? radius,
      height,
      o.segments ?? 14,
    ),
    material,
    o,
  );
}

export function group(children: THREE.Object3D[] = [], o: PlaceOptions = {}) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  if (o.position) g.position.set(...o.position);
  if (o.rotation) g.rotation.set(...o.rotation);
  if (o.scale) g.scale.set(...o.scale);
  if (o.name) g.name = o.name;
  return g;
}

/** Bakes matrices of static scenery once so the renderer skips per-frame matrix recomputation. */
export function freezeStatic(root: THREE.Object3D) {
  root.traverse((obj) => {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}
