import { type SkillDefinition, skillDefinitionSchema } from "@/types/skill";

// The one fully-defined skill with a seeded reference motion. Parsed at module
// load so an invalid definition fails fast rather than at render time.
export const needlePassingSkill: SkillDefinition = skillDefinitionSchema.parse({
  id: "needle-passing",
  title: "Needle Passing",
  description:
    "Pass a curved needle through three rings, then release it.",
  category: "suturing",
  difficulty: "beginner",
  estimatedMinutes: 6,
  referenceMotionId: "needle-passing-reference-v1",
  sourceLabel: "Scene guide, not an expert recording",
  availableModes: ["learn", "practice", "assessment"],
  segments: [
    { id: "approach", title: "Approach", instructions: "Move both instruments toward the first target without overshooting." },
    { id: "grip", title: "Grip", instructions: "Pinch to grasp the needle at the recommended point." },
    { id: "align", title: "Align", instructions: "Orient the needle tip square to the ring opening." },
    { id: "entry", title: "Entry", instructions: "Drive the tip through the ring along the target path." },
    { id: "rotation", title: "Rotation", instructions: "Rotate the wrist to follow the needle curvature." },
    { id: "exit", title: "Exit", instructions: "Pull the needle through until it clears the ring." },
    { id: "release", title: "Release", instructions: "Release the needle and reset for the next pass." },
    { id: "complete", title: "Complete", instructions: "All rings passed cleanly." },
  ],
  metricWeights: {
    pathSimilarity: 1,
    targetAccuracy: 1,
    rotationControlAccuracy: 1,
    movementSmoothness: 1,
    bimanualCoordination: 1,
  },
  coachingRules: [
    "needle-path-deviation",
    "wrist-rotation-mismatch",
    "overshoot-on-approach",
  ],
  sceneConfig: {
    sceneId: "needle-passing-scene",
    targetIds: ["ring-1", "ring-2", "ring-3"],
    dangerZoneIds: ["tissue-wall"],
  },
});
