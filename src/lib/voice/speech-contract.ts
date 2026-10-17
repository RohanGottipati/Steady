import { z } from "zod";

/**
 * Maximum length accepted by the dynamic `/api/speech` route. Bounds abuse and
 * keeps ElevenLabs latency/cost predictable; the final AI review narration and
 * one-off coaching phrases comfortably fit well under this.
 */
export const MAX_SPEECH_TEXT_LENGTH = 800;

/** Shared request contract for `/api/speech` (used by the route and client). */
export const speechRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "text is required")
    .max(MAX_SPEECH_TEXT_LENGTH, `text must be <= ${MAX_SPEECH_TEXT_LENGTH} characters`),
});

export type SpeechRequest = z.infer<typeof speechRequestSchema>;
