import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SpotLight,
  Vector3,
} from "three";
import { configureRoomRenderer } from "@/lib/ui/room-renderer";
import { batchScenery } from "@/lib/ui/batch-scenery";
import {
  trainingPointToWorld,
  trainingCameraPose,
} from "@/lib/ui/room-presentation";
import { applyReplayEmphasis } from "@/components/scene/replay-scene";
import type { ReplaySnapshot } from "@/lib/simulation/replay-controller";
describe("room presentation coordinates", () => {
  it("maps screen-up away across the table and depth upward without mutating canonical points", () => {
    const point = { x: 0.5, y: 0.25, z: 0.1 };
    const world = trainingPointToWorld(point);
    expect(world.x).toBeCloseTo(0.6);
    expect(world.y).toBeCloseTo(1.44);
    expect(world.z).toBeCloseTo(-0.35);
    expect(point).toEqual({ x: 0.5, y: 0.25, z: 0.1 });
  });
  it("frames replay issues in world space and increases distance on narrow screens", () => {
    const focus = { x: 0.5, y: 0.2, z: 0 };
    const camera = new PerspectiveCamera(50, 1.5, 0.05, 40);
    applyReplayEmphasis(camera, {
      divergenceEmphasis: true,
      focusPoint: focus,
    } as ReplaySnapshot);
    expect(camera.position.toArray()).toEqual(
      trainingCameraPose(1.5, focus).position.toArray(),
    );
    expect(
      trainingCameraPose(0.5).position.distanceTo(
        trainingCameraPose(0.5).target,
      ),
    ).toBeGreaterThan(
      trainingCameraPose(1.5).position.distanceTo(
        trainingCameraPose(1.5).target,
      ),
    );
  });
  it("batches static meshes while retaining world placement and light targets", () => {
    const root = new Group();
    const child = new Group();
    child.position.x = 2;
    const material = new MeshStandardMaterial();
    const first = new Mesh(new BoxGeometry(1, 1, 1), material);
    const second = new Mesh(new BoxGeometry(1, 1, 1), material);
    second.position.x = 2;
    child.add(first, second);
    root.add(child);
    const light = new SpotLight();
    root.add(light, light.target);
    batchScenery(root);
    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(1);
    meshes[0].geometry.computeBoundingBox();
    expect(meshes[0].geometry.boundingBox?.min.x).toBeCloseTo(1.5);
    expect(meshes[0].geometry.boundingBox?.max.x).toBeCloseTo(4.5);
    expect(root.getObjectById(light.id)).toBe(light);
    expect(root.getObjectById(light.target.id)).toBe(light.target);
    const transformed = new Vector3(0.5, 0, 0).applyMatrix4(root.matrixWorld);
    expect(transformed.x).toBe(0.5);
    meshes[0].geometry.dispose();
    material.dispose();
  });
});

it("automatically reduces software-renderer cost without changing hardware rendering", () => {
  const renderer = {
    getContext: () => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => "ANGLE SwiftShader",
    }),
    shadowMap: { enabled: true },
    setPixelRatio: vi.fn(),
  };
  expect(configureRoomRenderer(renderer as never)).toBe(true);
  expect(renderer.shadowMap.enabled).toBe(false);
  expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
});
