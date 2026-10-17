import { z } from "zod";

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Vec3 = z.infer<typeof vec3Schema>;

export const quatSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number(),
});

export type Quat = z.infer<typeof quatSchema>;

/** Canonical scene coordinate system for all runtime and reference motion. */
export const COORDINATE_SYSTEM = "scene-canonical-v1" as const;

export type CoordinateSystem = typeof COORDINATE_SYSTEM;
