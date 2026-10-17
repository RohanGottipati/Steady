import { describe, expect, it } from "vitest";

import {
  PERFORMANCE_VECTOR_ORDER,
  aiReviewSchema,
  attemptResultSchema,
  attemptUploadPayloadSchema,
  performanceVectorFromArray,
  performanceVectorSchema,
  performanceVectorToArray,
  referenceMotionSchema,
  skillDefinitionSchema,
} from "@/types";
import {
  perfectPerformance,
  sampleAttemptResult,
  sampleReferenceMotion,
  sampleSkillDefinition,
} from "../fixtures/contracts";

describe("shared contracts", () => {
  it("keeps a stable 20-metric performance vector order", () => {
    expect(PERFORMANCE_VECTOR_ORDER).toHaveLength(20);
    expect(new Set(PERFORMANCE_VECTOR_ORDER).size).toBe(20);
    expect(performanceVectorSchema.parse(perfectPerformance)).toEqual(
      perfectPerformance,
    );
  });

  it("round-trips performance vectors through vector(20) arrays", () => {
    const asArray = performanceVectorToArray(perfectPerformance);
    expect(asArray).toHaveLength(20);
    expect(asArray.every((v) => v === 100)).toBe(true);
    expect(performanceVectorFromArray(asArray)).toEqual(perfectPerformance);
  });

  it("rejects performance arrays with the wrong length", () => {
    expect(() => performanceVectorFromArray([1, 2, 3])).toThrow(/Expected 20/);
  });

  it("parses skill, reference motion, and attempt result fixtures", () => {
    expect(skillDefinitionSchema.parse(sampleSkillDefinition).id).toBe(
      "needle-passing",
    );
    expect(referenceMotionSchema.parse(sampleReferenceMotion).frames).toHaveLength(
      2,
    );
    expect(attemptResultSchema.parse(sampleAttemptResult).overallScore).toBe(
      100,
    );
  });

  it("parses a compact attempt upload payload", () => {
    const payload = attemptUploadPayloadSchema.parse({
      attempt: {
        id: sampleAttemptResult.id,
        anonymousUserId: "anon-1",
        skillId: sampleAttemptResult.skillId,
        mode: sampleAttemptResult.mode,
        startedAt: "2026-10-16T00:00:00.000Z",
        completedAt: "2026-10-16T00:00:12.000Z",
        durationMs: sampleAttemptResult.durationMs,
        result: sampleAttemptResult,
      },
      motionSamples: [
        {
          sampledAt: "2026-10-16T00:00:01.000Z",
          seq: 0,
          segment: "approach",
          leftTool: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            tipPosition: { x: 0, y: 0, z: 0.1 },
            jawClosed: false,
          },
        },
      ],
      metricSamples: [
        {
          sampledAt: "2026-10-16T00:00:01.000Z",
          seq: 0,
          segment: "approach",
          pathDeviation: 0.02,
        },
      ],
      coachingEvents: [
        {
          id: "evt-1",
          tMs: 500,
          type: "path_deviation",
          severity: 0.7,
          segmentId: "approach",
          data: { distance: 0.12 },
        },
      ],
    });

    expect(payload.motionSamples).toHaveLength(1);
    expect(payload.coachingEvents[0]?.type).toBe("path_deviation");
  });

  it("validates AI review JSON shape", () => {
    const review = aiReviewSchema.parse({
      summary: "Strong path control with a late rotation.",
      strengths: ["Path similarity stayed high."],
      improvements: ["Begin instrument rotation earlier in the entry segment."],
      largestDifference: {
        segmentId: "rotation",
        explanation: "Orientation lagged the reference by about 19 degrees.",
      },
      replayNarration:
        "Watch the rotation segment: start turning earlier to match the reference.",
    });

    expect(review.strengths).toHaveLength(1);
  });

  it("rejects AI reviews outside the allowed strength/improvement counts", () => {
    expect(() =>
      aiReviewSchema.parse({
        summary: "x",
        strengths: [],
        improvements: ["y"],
        largestDifference: { segmentId: "a", explanation: "b" },
        replayNarration: "c",
      }),
    ).toThrow();
  });
});
