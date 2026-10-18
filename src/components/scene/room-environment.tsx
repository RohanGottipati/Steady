"use client";
import { useEffect, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Mesh, Light, PerspectiveCamera } from "three";
import { buildOperatingRoom } from "./scenery/OperatingRoom";
import { buildOperatingRoomLighting } from "./scenery/OperatingRoomLighting";
import { TRAINING_FIELD, CAMERA_PRESETS } from "@/data/scene-layout";
import { batchScenery } from "@/lib/ui/batch-scenery";
import { trainingCameraPose } from "@/lib/ui/room-presentation";
export function RoomScenery({
  performanceMode = false,
}: {
  performanceMode?: boolean;
}) {
  const room = useMemo(() => {
    const { root } = buildOperatingRoom(!performanceMode);
    root.add(buildOperatingRoomLighting(!performanceMode));
    return batchScenery(root);
  }, [performanceMode]);
  useEffect(
    () => () => {
      // Shared materials/textures are bounded module caches. Only per-view geometry and shadow maps are owned here.
      const disposed = new Set();
      room.traverse((object) => {
        if (object instanceof Mesh && !disposed.has(object.geometry)) {
          object.geometry.dispose();
          disposed.add(object.geometry);
        }
        if (object instanceof Light && "shadow" in object) {
          (
            object as Light & { shadow: { dispose: () => void } }
          ).shadow.dispose();
        }
      });
    },
    [room],
  );
  return (
    <>
      <color attach="background" args={["#0f1c26"]} />
      <primitive object={room} dispose={null} />
    </>
  );
}
export function TrainingField({ children }: { children: ReactNode }) {
  return (
    <group
      name="training-field"
      position={TRAINING_FIELD.position}
      rotation={TRAINING_FIELD.rotation}
      scale={TRAINING_FIELD.scale}
    >
      {children}
    </group>
  );
}
export function RoomCamera({ landing = false }: { landing?: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const pose = trainingCameraPose(size.width / Math.max(size.height, 1));
    if (landing) {
      camera.position.set(...CAMERA_PRESETS.landing.position);
      camera.lookAt(...CAMERA_PRESETS.landing.target);
    } else {
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, landing]);
  return null;
}
