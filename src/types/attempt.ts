import { z } from "zod";

import { coachingEventSchema } from "./coaching";
import {
  categoryScoresSchema,
  performanceVectorSchema,
  replayMarkerSchema,
} from "./evaluation";
import { motionFrameSchema } from "./motion";
import { DATA_SCHEMA_VERSION } from "./schema-version";
import { trainingModeSchema } from "./skill";
import { toolFrameSchema } from "./tool";

export const attemptResultSchema = z.object({
  schemaVersion: z.literal(DATA_SCHEMA_VERSION),
  id: z.string().min(1),
  skillId: z.string().min(1),
  mode: trainingModeSchema,
  createdAt: z.string().min(1),
  durationMs: z.number().nonnegative(),
  referenceMotionId: z.string().min(1),
  performance: performanceVectorSchema,
  categoryScores: categoryScoresSchema,
  overallScore: z.number().min(0).max(100),
  importantEvents: z.array(coachingEventSchema),
  worstMoments: z.array(replayMarkerSchema),
});

export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const cloudSyncStatusSchema = z.enum(["pending", "synced", "failed"]);

export type CloudSyncStatus = z.infer<typeof cloudSyncStatusSchema>;

export const savedAttemptSchema = z.object({
  result: attemptResultSchema,
  userReplayFrames: z.array(motionFrameSchema),
  cloudSyncStatus: cloudSyncStatusSchema,
});

export type SavedAttempt = z.infer<typeof savedAttemptSchema>;

export const motionSampleSchema = z.object({
  sampledAt: z.string().min(1),
  seq: z.number().int().nonnegative(),
  segment: z.string().min(1),
  leftTool: toolFrameSchema.optional(),
  rightTool: toolFrameSchema.optional(),
});

export type MotionSample = z.infer<typeof motionSampleSchema>;

export const metricSampleSchema = z.object({
  sampledAt: z.string().min(1),
  seq: z.number().int().nonnegative(),
  segment: z.string().min(1),
  pathDeviation: z.number().optional(),
  orientationErrorDeg: z.number().optional(),
  speed: z.number().optional(),
  jerk: z.number().optional(),
  gripError: z.number().optional(),
  coordinationError: z.number().optional(),
});

export type MetricSample = z.infer<typeof metricSampleSchema>;

export const attemptUploadPayloadSchema = z.object({
  attempt: z.object({
    id: z.string().min(1),
    anonymousUserId: z.string().min(1),
    skillId: z.string().min(1),
    mode: trainingModeSchema,
    startedAt: z.string().min(1),
    completedAt: z.string().min(1),
    durationMs: z.number().nonnegative(),
    result: attemptResultSchema,
  }),
  motionSamples: z.array(motionSampleSchema),
  metricSamples: z.array(metricSampleSchema),
  coachingEvents: z.array(coachingEventSchema),
});

export type AttemptUploadPayload = z.infer<typeof attemptUploadPayloadSchema>;
