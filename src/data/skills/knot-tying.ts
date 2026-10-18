import { type SkillBlueprint, skillBlueprintSchema } from "@/types/skill";

// Authored training design for Knot Tying. Like suturing, listed but not yet
// trainable: the committed JIGSAWS reference is data-only and no knot-tying scene
// exists yet. Phases are scene-aligned surgical phases authored for Steady, not
// the raw G1-G15 gesture labels in the reference file.
export const knotTyingBlueprint: SkillBlueprint = skillBlueprintSchema.parse({
  id: "knot-tying",
  referenceMotionId: "knot-tying-jigsaws-expert-v1",
  sourceLabel: "JIGSAWS expert demonstration (data-only until a trainer scene lands)",
  attribution:
    "Expert motion derived from JIGSAWS (Knot_Tying_E003, expert, GRS 22) for academic, non-commercial use. Gao et al. 2014, The JHU-ISI Gesture and Skill Assessment Working Set (JIGSAWS).",
  segments: [
    { id: "loop", title: "Loop", instructions: "Wrap the suture around the needle driver to form the first throw." },
    { id: "grasp", title: "Grasp", instructions: "With the wrapped instrument, grasp the short free end of the suture." },
    { id: "cinch", title: "Cinch", instructions: "Draw the first throw down flat with even tension from both hands." },
    { id: "reverse", title: "Reverse", instructions: "Wrap the opposite way to lay the second throw against the first." },
    { id: "square", title: "Square", instructions: "Seat the second throw square so the knot locks and does not slip." },
    { id: "complete", title: "Complete", instructions: "Knot tied square and secure with controlled tension." },
  ],
  metricWeights: {
    pathSimilarity: 1,
    bimanualCoordination: 1.4,
    pinchStability: 1.2,
    gripTiming: 1.2,
    movementSmoothness: 1.1,
    correctionEfficiency: 1,
  },
  coachingRules: [
    "throw-tension-symmetry",
    "square-knot-seating",
    "bimanual-wrap-coordination",
  ],
});
