import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  type Group,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
/** Batch static scenery only. Lights and their target hierarchy remain intact. */
export function batchScenery(root: Group): Group {
  root.updateMatrixWorld(true);
  const batches = new Map<
    string,
    {
      material: Material;
      cast: boolean;
      receive: boolean;
      geometries: BufferGeometry[];
    }
  >();
  const originals: Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const attribute of Object.keys(geometry.attributes))
      if (!["position", "normal", "uv"].includes(attribute))
        geometry.deleteAttribute(attribute);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv"))
      geometry.setAttribute(
        "uv",
        new Float32BufferAttribute(
          new Float32Array(geometry.getAttribute("position").count * 2),
          2,
        ),
      );
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        material: object.material,
        cast: object.castShadow,
        receive: object.receiveShadow,
        geometries: [],
      };
      batches.set(key, batch);
    }
    batch.geometries.push(geometry);
    originals.push(object);
  });
  for (const object of originals) {
    object.removeFromParent();
    object.geometry.dispose();
  }
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries);
    for (const source of batch.geometries) source.dispose();
    if (!geometry)
      throw new Error("Static room geometry could not be batched.");
    const mesh = new Mesh(geometry, batch.material);
    mesh.castShadow = batch.cast;
    mesh.receiveShadow = batch.receive;
    mesh.name = "batched-scenery";
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
  return root;
}
