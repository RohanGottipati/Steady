import { type SkillBlueprint, skillBlueprintSchema } from "@/types/skill";

// Authored training design for Suturing. Listed but not yet trainable: the
// committed JIGSAWS reference is data-only (gesture-labelled, raw metre scale)
// and no suturing scene exists yet, so this stays a blueprint, not a launchable
// SkillDefinition. Phases are scene-aligned surgical phases authored for Steady,
// not the raw G1-G15 gesture labels in the reference file. Parsed at load so an
// invalid blueprint fails fast.
export const suturingBlueprint: SkillBlueprint = skillBlueprintSchema.parse({
  id: "suturing",
  referenceMotionId: "suturing-jigsaws-expert-v1",
  sourceLabel: "JIGSAWS expert demonstration (data-only until a trainer scene lands)",
  attribution:
    "Expert motion derived from JIGSAWS (Suturing_E002, expert, GRS 20) for academic, non-commercial use. Gao et al. 2014, The JHU-ISI Gesture and Skill Assessment Working Set (JIGSAWS).",
  segments: [
    { id: "orient", title: "Orient", instructions: "Position the needle driver and square the curved needle to the wound line." },
    { id: "bite", title: "Bite", instructions: "Drive the needle tip into the tissue at the planned entry, a consistent bite width from the edge." },
    { id: "drive", title: "Drive", instructions: "Pronate the wrist to follow the needle's curve through the tissue toward the exit." },
    { id: "extract", title: "Extract", instructions: "Pull the needle through along its curve until it clears the far side." },
    { id: "regrasp", title: "Regrasp", instructions: "Release and regrasp the needle to reset for tensioning without tearing the tissue." },
    { id: "tension", title: "Tension", instructions: "Draw the suture through and set even tension so the wound edges just appose." },
    { id: "complete", title: "Complete", instructions: "Suture placed with consistent spacing, depth, and tension." },
  ],
  metricWeights: {
    pathSimilarity: 1,
    targetAccuracy: 1.2,
    depthConsistency: 1.4,
    instrumentOrientationAccuracy: 1.1,
    rotationControlAccuracy: 1.3,
    movementSmoothness: 1,
    bimanualCoordination: 1.1,
  },
  coachingRules: [
    "suture-bite-depth-consistency",
    "needle-pronation-arc",
    "edge-approximation-tension",
  ],
});
