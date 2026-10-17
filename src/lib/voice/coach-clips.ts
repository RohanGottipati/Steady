import type { CoachingEventType } from "@/types/coaching";

/**
 * Canonical manifest of the pre-generated coaching voice clips (plan §14.3, B7).
 *
 * This module is intentionally dependency-free (type-only import above) so the
 * ElevenLabs pre-generation script can load it under Node's type stripping
 * without pulling in zod / Next internals. The clip `text` is duplicated from
 * B6's `COACHING_MESSAGES`; `tests/unit/coach-clips.test.ts` guards that the two
 * never drift, keeping a single effective source of truth.
 */
export interface CoachClip {
  type: CoachingEventType;
  text: string;
  file: string;
}

export const COACH_CLIPS: readonly CoachClip[] = [
  { type: "path_deviation", text: "Return toward the highlighted path.", file: "path_deviation.mp3" },
  { type: "rotation_late", text: "Begin rotating earlier.", file: "rotation_late.mp3" },
  { type: "moving_too_fast", text: "Slow down as you approach the target.", file: "moving_too_fast.mp3" },
  { type: "unstable_grip", text: "Keep your grip consistent.", file: "unstable_grip.mp3" },
  { type: "left_hand_unstable", text: "Keep your assisting hand steady.", file: "left_hand_unstable.mp3" },
  { type: "danger_zone_near", text: "Ease away from the tissue wall.", file: "danger_zone_near.mp3" },
  { type: "overshoot", text: "You moved past the target — correct gently.", file: "overshoot.mp3" },
] as const;

export const COACH_CLIP_BY_TYPE: Record<CoachingEventType, CoachClip> =
  Object.fromEntries(COACH_CLIPS.map((c) => [c.type, c])) as Record<
    CoachingEventType,
    CoachClip
  >;

/** Public directory (under `public/`) where generated clips are served from. */
export const COACH_CLIP_DIR = "/audio/coach";

/** Resolve the public URL a browser uses to play a pre-generated clip. */
export function coachClipPath(type: CoachingEventType): string {
  return `${COACH_CLIP_DIR}/${COACH_CLIP_BY_TYPE[type].file}`;
}
