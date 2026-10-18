import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { TRAINING_FIELD } from "@/data/scene-layout";
import type { Vec3 } from "@/types";
const transform = new Matrix4().compose(
  new Vector3(...TRAINING_FIELD.position),
  new Quaternion().setFromEuler(new Euler(...TRAINING_FIELD.rotation)),
  new Vector3().setScalar(TRAINING_FIELD.scale),
);
/** Presentation only: canonical simulation coordinates never pass through this transform. */
export function trainingPointToWorld(point: Vec3): Vector3 {
  return new Vector3(point.x, point.y, point.z).applyMatrix4(transform);
}
export function trainingCameraPose(
  aspect: number,
  focus = { x: 0, y: 0.15, z: 0 },
) {
  const target = trainingPointToWorld(focus);
  const distance =
    2.2 /
    Math.tan((25 * Math.PI) / 180) /
    Math.min(Math.max(aspect, 0.45), 1.4);
  return {
    target,
    position: target
      .clone()
      .add(new Vector3(0, 1.45, 1.9).normalize().multiplyScalar(distance)),
  };
}
