import { z } from "zod";

import { COORDINATE_SYSTEM } from "./geometry";
import { handFrameSchema } from "./hand";
import { DATA_SCHEMA_VERSION } from "./schema-version";
import { toolStateSchema } from "./tool";

export const motionFrameSchema = z.object({
  tMs: z.number().nonnegative(),
  segmentId: z.string().min(1),
  normalizedProgress: z.number().min(0).max(1),
  leftTool: toolStateSchema,
  rightTool: toolStateSchema,
  leftHand: handFrameSchema.optional(),
  rightHand: handFrameSchema.optional(),
});

export type MotionFrame = z.infer<typeof motionFrameSchema>;

export const referenceEnvelopeSchema = z.object({
  sampleCount: z.number().int().positive(),
  percentileLow: z.number(),
  percentileHigh: z.number(),
  leftToolPositionTolerance: z.array(
    z.object({ x: z.number(), y: z.number(), z: z.number() }),
  ),
  rightToolPositionTolerance: z.array(
    z.object({ x: z.number(), y: z.number(), z: z.number() }),
  ),
  orientationToleranceDeg: z.array(z.number()),
});

export type ReferenceEnvelope = z.infer<typeof referenceEnvelopeSchema>;

export const referenceMotionSegmentSchema = z.object({
  id: z.string().min(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

export const referenceMotionSchema = z.object({
  schemaVersion: z.literal(DATA_SCHEMA_VERSION),
  id: z.string().min(1),
  skillId: z.string().min(1),
  sourceType: z.enum(["dataset", "internal-recording"]),
  sourceName: z.string().min(1),
  coordinateSystem: z.literal(COORDINATE_SYSTEM),
  fps: z.number().positive(),
  segments: z.array(referenceMotionSegmentSchema),
  frames: z.array(motionFrameSchema),
  envelope: referenceEnvelopeSchema.optional(),
});

export type ReferenceMotion = z.infer<typeof referenceMotionSchema>;
