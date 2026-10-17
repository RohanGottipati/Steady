import { z } from "zod";

import { categoryScoresSchema, metricResultSchema, replayMarkerSchema } from "@/types/evaluation";
import { trainingModeSchema } from "@/types/skill";
import { aiReviewSchema } from "@/types/ai";
import { selectFocusMarker } from "@/lib/evaluation/focus-marker";

/** Compact metrics sent to `/api/review`. Motion frames and webcam frames stay out. */
export const reviewRequestSchema = z.object({
  skillId: z.string().min(1),
  mode: trainingModeSchema,
  overallScore: z.number().min(0).max(100),
  categoryScores: categoryScoresSchema,
  strongest: z.object({
    id: z.string().min(1),
    score: z.number().min(0).max(100),
    explanation: z.string().min(1),
  }),
  weakest: z.object({
    id: z.string().min(1),
    score: z.number().min(0).max(100),
    explanation: z.string().min(1),
  }),
  metrics: z.array(metricResultSchema.extend({ explanation: z.string() })).max(20),
  worstMoments: z.array(replayMarkerSchema).max(3),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** A schema-valid review must describe the same selected issue as the renderer. */
export function validatedReview(value: unknown, request: ReviewRequest) {
  const parsed = aiReviewSchema.safeParse(value);
  if (!parsed.success) return null;
  const focus = selectFocusMarker(request.worstMoments);
  if (focus && parsed.data.largestDifference.segmentId !== focus.segmentId) return null;
  return parsed.data;
}

export const REVIEW_UNAVAILABLE = "AI review is unavailable. Showing the notes from this attempt's scores.";
