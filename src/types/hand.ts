import { z } from "zod";

import { quatSchema, vec3Schema } from "./geometry";

export const handednessSchema = z.enum(["Left", "Right"]);

export type Handedness = z.infer<typeof handednessSchema>;

export const handFrameSchema = z.object({
  handedness: handednessSchema,
  confidence: z.number(),
  /** Normalized image coordinates (MediaPipe landmarks). */
  landmarks: z.array(vec3Schema),
  /** MediaPipe local hand world coordinates. */
  worldLandmarks: z.array(vec3Schema),
  palmCenter: vec3Schema,
  palmRotation: quatSchema,
  pinchRatio: z.number(),
  isPinching: z.boolean(),
});

export type HandFrame = z.infer<typeof handFrameSchema>;
