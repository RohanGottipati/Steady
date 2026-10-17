import { z } from "zod";

export const coachingEventTypeSchema = z.enum([
  "path_deviation",
  "rotation_late",
  "moving_too_fast",
  "unstable_grip",
  "left_hand_unstable",
  "danger_zone_near",
  "overshoot",
]);

export type CoachingEventType = z.infer<typeof coachingEventTypeSchema>;

export const coachingEventSchema = z.object({
  id: z.string().min(1),
  tMs: z.number().nonnegative(),
  type: coachingEventTypeSchema,
  severity: z.number().min(0).max(1),
  segmentId: z.string().min(1),
  data: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

export type CoachingEvent = z.infer<typeof coachingEventSchema>;

/** Default live coaching message policy (§14.2). */
export const COACHING_MESSAGE_POLICY = {
  minimumSeverity: 0.65,
  cooldownMs: 4_000,
  maxLiveSpokenMessagesPerAttempt: 4,
  sameEventRepeatSuppressionMs: 8_000,
} as const;
