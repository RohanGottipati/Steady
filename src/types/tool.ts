import { z } from "zod";

import { quatSchema, vec3Schema } from "./geometry";

export const toolIdSchema = z.enum(["left-tool", "right-tool"]);

export type ToolId = z.infer<typeof toolIdSchema>;

export const toolStateSchema = z.object({
  id: toolIdSchema,
  position: vec3Schema,
  rotation: quatSchema,
  tipPosition: vec3Schema,
  jawClosed: z.boolean(),
  heldObjectId: z.string().optional(),
});

export type ToolState = z.infer<typeof toolStateSchema>;

/** Compact tool pose for Tiger/IndexedDB motion samples (no tool id). */
export const toolFrameSchema = z.object({
  position: vec3Schema,
  rotation: quatSchema,
  tipPosition: vec3Schema,
  jawClosed: z.boolean(),
});

export type ToolFrame = z.infer<typeof toolFrameSchema>;
