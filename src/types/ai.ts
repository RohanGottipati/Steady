import { z } from "zod";

/**
 * Backboard / Gemini attempt-review JSON contract (§16.5).
 * Generative AI may only explain supplied metrics — never invent scores.
 */
export const aiReviewSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1).max(3),
  improvements: z.array(z.string().min(1)).min(1).max(3),
  largestDifference: z.object({
    segmentId: z.string().min(1),
    explanation: z.string().min(1),
  }),
  replayNarration: z.string().min(1),
});

export type AiReview = z.infer<typeof aiReviewSchema>;

export const AI_REVIEW_SYSTEM_PROMPT = `You are an educational surgical-motion simulation coach.
You receive objective metrics calculated by a deterministic computer-vision and kinematics engine.
Only describe findings supported by the supplied measurements.
Do not invent scores, angles, timing, or medical conclusions.
Do not claim the user is qualified or unqualified to perform surgery.
Use concise, specific language focused on movement precision, control, coordination, efficiency, and simulator technique.
Return only the requested JSON schema.`;
