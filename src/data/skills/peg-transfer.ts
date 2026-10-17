import { type SkillDefinition, skillDefinitionSchema } from "@/types/skill";

// Second fully-defined skill. Segment ids match the synthetic peg-transfer
// reference and must not reuse Needle Passing phase names.
export const pegTransferSkill: SkillDefinition = skillDefinitionSchema.parse({
  id: "peg-transfer",
  title: "Peg Transfer",
  description:
    "Lift a peg off the left post, carry it through the midline with both instruments, and place it on the right post.",
  category: "laparoscopic",
  difficulty: "beginner",
  estimatedMinutes: 5,
  referenceMotionId: "peg-transfer-reference-v1",
  sourceLabel: "Synthetic reference (not expert data)",
  availableModes: ["learn", "practice", "assessment"],
  segments: [
    { id: "reach", title: "Reach", instructions: "Move an open instrument tip to the peg on the left post." },
    { id: "grasp", title: "Grasp", instructions: "Pinch to grasp the peg while it is still on the left post." },
    { id: "lift", title: "Lift", instructions: "Lift the peg clear of the left post before moving it across." },
    { id: "transfer", title: "Transfer", instructions: "Carry the peg through the midline and meet it with the other instrument." },
    { id: "place", title: "Place", instructions: "Lower the peg onto the right post." },
    { id: "release", title: "Release", instructions: "Open your pinch to release the peg on the right post." },
    { id: "complete", title: "Complete", instructions: "Peg transferred cleanly." },
  ],
  metricWeights: {
    pathSimilarity: 1.2,
    targetAccuracy: 1.1,
    bimanualCoordination: 1.4,
    movementSmoothness: 1,
    gripTiming: 1,
    toolCollisionAvoidance: 0.8,
  },
  coachingRules: [
    "peg-path-deviation",
    "early-release",
    "bimanual-meet",
  ],
  sceneConfig: {
    sceneId: "peg-transfer-scene",
    targetIds: ["source-post", "transfer-zone", "target-post"],
    dangerZoneIds: ["board-edge"],
  },
});
