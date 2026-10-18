import { skillDefinitionSchema, type SkillDefinition, type Vec3 } from "@/types";
import { pointDistance, pointInBox } from "./needle-passing-config";

export const ROUTE_SKILL_IDS = [
  "suturing",
  "knot-tying",
  "pattern-cutting",
  "ligating-loop",
  "clip-applying",
  "needle-loading",
  "tissue-retraction",
  "camera-navigation",
] as const;

export type RouteSkillId = (typeof ROUTE_SKILL_IDS)[number];
export type RouteFixtureId = `${RouteSkillId}-good`;

export type RouteObjectKind = "needle" | "suture" | "loop" | "clip" | "tissue" | "bead" | "marker";

export type RoutePhaseKind = "reach" | "grasp" | "lift" | "carry" | "place" | "release" | "regrasp" | "trace";

export interface RoutePhase {
  segmentId: string;
  title: string;
  instructions: string;
  kind: RoutePhaseKind;
  position: Readonly<Vec3>;
  targetId: string;
  radius?: number;
  clearance?: number;
  requireAssist?: boolean;
  heightSlack?: number;
  live: string;
  dropped: string;
}

export interface RouteDangerZone {
  id: string;
  label: string;
  center: Readonly<Vec3>;
  halfExtents: Readonly<Vec3>;
}

export interface RouteTask {
  skillId: RouteSkillId;
  title: string;
  objectId: string;
  objectLabel: string;
  objectNoun: string;
  objectKind: RouteObjectKind;
  home: Readonly<Vec3>;
  danger: RouteDangerZone;
  phases: readonly RoutePhase[];
  segmentIds: readonly string[];
  corridor: readonly Vec3[];
  corridorSegments: readonly string[];
  demoMessage: string;
  referenceLabel: string;
  coachHint: string;
  steps: readonly [string, string, string];
  sceneId: string;
  referenceMotionId: string;
  targetIds: readonly string[];
  skill: SkillDefinition;
  sourceLicense: string;
}

export const ROUTE_THRESHOLDS = {
  reachRadius: 0.2,
  graspRadius: 0.18,
  liftClearance: 0.1,
  carryRadius: 0.1,
  assistMeetRadius: 0.14,
  placeRadius: 0.1,
  placeHeightSlack: 0.05,
  traceRadius: 0.08,
  corridorToleranceUnits: 0.14,
  sustainedDeviationMs: 1600,
  demonstrationDurationMs: 3000,
} as const;

const BOARD_EDGE = {
  center: { x: 0, y: 0.02, z: 0 } as const,
  halfExtents: { x: 0.42, y: 0.05, z: 0.14 } as const,
};

interface Spec {
  skillId: RouteSkillId;
  title: string;
  description: string;
  category: SkillDefinition["category"];
  difficulty: SkillDefinition["difficulty"];
  estimatedMinutes: number;
  sourceLabel: string;
  sourceLicense: string;
  objectId: string;
  objectLabel: string;
  objectNoun: string;
  objectKind: RouteObjectKind;
  home: Vec3;
  phases: RoutePhase[];
  complete: string;
  demoMessage: string;
  referenceLabel: string;
  coachHint: string;
  steps: [string, string, string];
  metricWeights: Record<string, number>;
  coachingRules: string[];
}

function v(x: number, y: number, z = 0): Vec3 {
  return { x, y, z };
}

function phase(input: RoutePhase): RoutePhase {
  return input;
}

function buildTask(spec: Spec): RouteTask {
  const danger: RouteDangerZone = {
    id: `${spec.skillId}-edge`,
    label: "Board edge",
    center: BOARD_EDGE.center,
    halfExtents: BOARD_EDGE.halfExtents,
  };
  const segmentIds = [...spec.phases.map(item => item.segmentId), "complete"];
  const targetIds = [...new Set(spec.phases.map(item => item.targetId).filter(id => id !== spec.objectId))];
  const corridorSegments = spec.phases
    .filter(item => item.kind === "lift" || item.kind === "carry" || item.kind === "place" || item.kind === "trace")
    .map(item => item.segmentId);
  const corridor = spec.phases.some(item => item.kind === "trace")
    ? spec.phases.filter(item => item.kind === "trace").map(item => ({ ...item.position }))
    : [spec.home, ...spec.phases.filter(item => item.kind !== "reach" && item.kind !== "grasp" && item.kind !== "regrasp").map(item => ({ ...item.position }))];
  const skill = skillDefinitionSchema.parse({
    id: spec.skillId,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    difficulty: spec.difficulty,
    estimatedMinutes: spec.estimatedMinutes,
    referenceMotionId: `${spec.skillId}-reference-v1`,
    sourceLabel: spec.sourceLabel,
    availableModes: ["learn", "practice", "assessment"],
    segments: [
      ...spec.phases.map(item => ({ id: item.segmentId, title: item.title, instructions: item.instructions })),
      { id: "complete", title: "Complete", instructions: spec.complete },
    ],
    metricWeights: spec.metricWeights,
    coachingRules: spec.coachingRules,
    sceneConfig: {
      sceneId: `${spec.skillId}-scene`,
      targetIds,
      dangerZoneIds: [danger.id],
    },
  });
  return {
    skillId: spec.skillId,
    title: spec.title,
    objectId: spec.objectId,
    objectLabel: spec.objectLabel,
    objectNoun: spec.objectNoun,
    objectKind: spec.objectKind,
    home: spec.home,
    danger,
    phases: spec.phases,
    segmentIds,
    corridor,
    corridorSegments,
    demoMessage: spec.demoMessage,
    referenceLabel: spec.referenceLabel,
    coachHint: spec.coachHint,
    steps: spec.steps,
    sceneId: skill.sceneConfig.sceneId,
    referenceMotionId: skill.referenceMotionId,
    targetIds,
    skill,
    sourceLicense: spec.sourceLicense,
  };
}

const synthetic = "Synthetic reference (not expert data)";
const syntheticLicense = "Repository-authored synthetic guide. Not expert data.";
const jigsawsLabel = "Synthetic scene guide (JIGSAWS expert file remains data-only)";
const jigsawsLicense = "Repository-authored scene guide. The committed JIGSAWS file is academic, non-commercial, and is not the scoring reference.";

const ROUTE_TASK_LIST: readonly RouteTask[] = [
  buildTask({
    skillId: "suturing",
    title: "Suturing",
    description: "Drive a curved needle through a wound line, regrasp it, and set even tension so the edges meet.",
    category: "suturing",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    sourceLabel: jigsawsLabel,
    sourceLicense: jigsawsLicense,
    objectId: "practice-suture-needle",
    objectLabel: "Needle",
    objectNoun: "needle",
    objectKind: "needle",
    home: v(-0.22, 0.2),
    complete: "Suture placed with a controlled bite and even tension.",
    demoMessage: "Learn demonstration: watch the needle travel the wound line, then regrasp and seat the tension, or select Start attempt.",
    referenceLabel: "Synthetic suturing guide (not the JIGSAWS recording)",
    coachHint: "Keep the needle on the wound line. Regrasp before you set tension, and bring the other instrument in to seat it.",
    steps: [
      "Reach the needle at the near wound edge and pinch to grasp it.",
      "Drive through the bite, pull clear, then open and pinch again to regrasp.",
      "Draw the needle to the far seat and meet it with the other instrument.",
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
    coachingRules: ["suture-bite-depth-consistency", "needle-pronation-arc", "edge-approximation-tension"],
    phases: [
      phase({ segmentId: "orient", title: "Orient", instructions: "Position an open instrument tip on the needle at the near wound edge.", kind: "reach", position: v(-0.22, 0.2), targetId: "practice-suture-needle", live: "Move an open instrument tip onto the needle.", dropped: "Pick up the needle at the near wound edge." }),
      phase({ segmentId: "bite", title: "Bite", instructions: "Pinch to grasp the needle on the near wound edge.", kind: "grasp", position: v(-0.22, 0.2), targetId: "bite-entry", live: "Pinch to grasp the needle. The far seat does not count yet.", dropped: "The needle is free. Grasp it on the near wound edge." }),
      phase({ segmentId: "drive", title: "Drive", instructions: "Carry the needle through the bite toward the middle of the wound.", kind: "carry", position: v(-0.02, 0.32), targetId: "drive-exit", live: "Drive the needle along the wound to the middle mark.", dropped: "Needle released early. Pick it up and continue through the bite." }),
      phase({ segmentId: "extract", title: "Extract", instructions: "Pull the needle clear on the far side of the wound.", kind: "carry", position: v(0.16, 0.3), targetId: "extract-point", live: "Pull the needle clear of the far wound edge.", dropped: "Needle released early. Pick it up and extract it." }),
      phase({ segmentId: "regrasp", title: "Regrasp", instructions: "Open, then pinch again to reset your grasp before tensioning.", kind: "regrasp", position: v(0.16, 0.3), targetId: "extract-point", live: "Open your pinch, then grasp the needle again at the extract mark.", dropped: "The needle left the extract mark. Bring it back before you regrasp." }),
      phase({ segmentId: "tension", title: "Tension", instructions: "Draw the needle to the seat and meet it with the other instrument.", kind: "place", position: v(0.22, 0.18), targetId: "tension-seat", requireAssist: true, live: "Lower the needle onto the tension seat and bring the other instrument to it.", dropped: "Needle released early. Pick it up and seat the tension." }),
    ],
  }),
  buildTask({
    skillId: "knot-tying",
    title: "Knot Tying",
    description: "Throw two opposite loops with a suture tail and seat them square on the knot post.",
    category: "suturing",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    sourceLabel: jigsawsLabel,
    sourceLicense: jigsawsLicense,
    objectId: "practice-suture-tail",
    objectLabel: "Suture",
    objectNoun: "suture tail",
    objectKind: "suture",
    home: v(-0.2, 0.2),
    complete: "Both throws are seated square on the knot post.",
    demoMessage: "Learn demonstration: watch both throws travel around the knot post and seat square, or select Start attempt.",
    referenceLabel: "Synthetic knot-tying guide (not the JIGSAWS recording)",
    coachHint: "Keep the tail in the jaws. Meet the other hand on the first throw, reverse to the far side, then seat the knot flat.",
    steps: [
      "Reach the suture tail and pinch to grasp it.",
      "Carry the first throw to the midline and meet it with the other instrument.",
      "Reverse to the far side, then lower the tail onto the knot post.",
    ],
    metricWeights: {
      pathSimilarity: 1,
      bimanualCoordination: 1.4,
      pinchStability: 1.2,
      gripTiming: 1.2,
      movementSmoothness: 1.1,
      correctionEfficiency: 1,
    },
    coachingRules: ["throw-tension-symmetry", "square-knot-seating", "bimanual-wrap-coordination"],
    phases: [
      phase({ segmentId: "loop", title: "Loop", instructions: "Move an open tip onto the suture tail to start the first throw.", kind: "reach", position: v(-0.2, 0.2), targetId: "practice-suture-tail", live: "Move an open instrument tip onto the suture tail.", dropped: "Pick up the suture tail." }),
      phase({ segmentId: "grasp", title: "Grasp", instructions: "Pinch to grasp the suture tail.", kind: "grasp", position: v(-0.2, 0.2), targetId: "tail-home", live: "Pinch to grasp the tail. The knot post does not count yet.", dropped: "The tail is free. Grasp it again." }),
      phase({ segmentId: "cinch", title: "Cinch", instructions: "Carry the first throw to the midline and meet it with the other instrument.", kind: "carry", position: v(0, 0.34), targetId: "first-throw", requireAssist: true, live: "Carry the tail through the midline and bring the other instrument to it.", dropped: "Tail released early. Pick it up and finish the first throw." }),
      phase({ segmentId: "reverse", title: "Reverse", instructions: "Carry the tail to the far side for the opposite throw.", kind: "carry", position: v(0.16, 0.3), targetId: "second-throw", live: "Reverse the tail to the far side of the knot post.", dropped: "Tail released early. Pick it up and reverse the throw." }),
      phase({ segmentId: "square", title: "Square", instructions: "Lower the tail onto the knot post so the throws sit flat.", kind: "place", position: v(0.04, 0.18), targetId: "knot-post", live: "Lower the tail onto the knot post.", dropped: "Tail released off the post. Pick it up and seat the knot." }),
    ],
  }),
  buildTask({
    skillId: "pattern-cutting",
    title: "Pattern Cutting",
    description: "Follow a marked circle with one open instrument tip. Stay on the line without cutting inside the pattern.",
    category: "laparoscopic",
    difficulty: "beginner",
    estimatedMinutes: 5,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-pattern-mark",
    objectLabel: "Mark",
    objectNoun: "pattern mark",
    objectKind: "bead",
    home: v(-0.36, 0.22),
    complete: "The circle was traced in order.",
    demoMessage: "Learn demonstration: watch the tip travel the marked circle, or select Start attempt.",
    referenceLabel: "Synthetic pattern-cutting guide (not expert data)",
    coachHint: "Keep the jaws open and ride the yellow circle. Each mark must be visited in order.",
    steps: [
      "Start at the left mark of the circle with an open tip.",
      "Follow the top of the circle, then the right-hand mark.",
      "Finish on the bottom mark. Do not pinch the pattern token.",
    ],
    metricWeights: { pathSimilarity: 1.4, targetAccuracy: 1.3, movementSmoothness: 1.1, pathEfficiency: 1.2, motionStability: 1 },
    coachingRules: ["pattern-line-tracking", "avoid-center-cut", "steady-cutting-speed"],
    phases: [
      phase({ segmentId: "approach", title: "Approach", instructions: "Place an open tip on the left mark of the circle.", kind: "trace", position: v(-0.1, 0.28), targetId: "cut-start", live: "Move an open tip onto the left mark.", dropped: "Stay on the circle." }),
      phase({ segmentId: "arc", title: "Arc", instructions: "Follow the circle up to the top mark.", kind: "trace", position: v(0.02, 0.4), targetId: "cut-top", live: "Follow the circle to the top mark.", dropped: "Return to the circle." }),
      phase({ segmentId: "turn", title: "Turn", instructions: "Continue to the right-hand mark.", kind: "trace", position: v(0.14, 0.28), targetId: "cut-side", live: "Continue to the right-hand mark.", dropped: "Return to the circle." }),
      phase({ segmentId: "finish", title: "Finish", instructions: "Close the circle on the bottom mark.", kind: "trace", position: v(0.02, 0.16), targetId: "cut-end", live: "Finish on the bottom mark.", dropped: "Return to the circle." }),
    ],
  }),
  buildTask({
    skillId: "ligating-loop",
    title: "Ligating Loop",
    description: "Lift a loop, carry it over the vessel stump with both instruments, and cinch it down.",
    category: "laparoscopic",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-loop",
    objectLabel: "Loop",
    objectNoun: "loop",
    objectKind: "loop",
    home: v(-0.24, 0.2),
    complete: "The loop is cinched on the vessel stump.",
    demoMessage: "Learn demonstration: watch the loop lift, meet at the stump, and cinch down, or select Start attempt.",
    referenceLabel: "Synthetic ligating-loop guide (not expert data)",
    coachHint: "Lift the loop clear before you cross. The other instrument has to meet you over the stump.",
    steps: [
      "Reach the loop and pinch to grasp it.",
      "Lift it clear, then carry it over the stump with the other instrument.",
      "Lower it onto the stump and open to cinch.",
    ],
    metricWeights: { pathSimilarity: 1.1, targetAccuracy: 1.2, bimanualCoordination: 1.4, gripTiming: 1.1, movementSmoothness: 1 },
    coachingRules: ["loop-over-stump", "bimanual-cinch", "avoid-early-release"],
    phases: [
      phase({ segmentId: "reach", title: "Reach", instructions: "Move an open tip onto the loop.", kind: "reach", position: v(-0.24, 0.2), targetId: "practice-loop", live: "Move an open instrument tip onto the loop.", dropped: "Pick up the loop." }),
      phase({ segmentId: "grasp", title: "Grasp", instructions: "Pinch to grasp the loop.", kind: "grasp", position: v(-0.24, 0.2), targetId: "loop-home", live: "Pinch to grasp the loop on its post.", dropped: "The loop is free. Grasp it again." }),
      phase({ segmentId: "lift", title: "Lift", instructions: "Lift the loop clear of its post.", kind: "lift", position: v(-0.24, 0.2), targetId: "loop-home", live: "Lift the loop straight up before you cross.", dropped: "Loop released early. Pick it up and lift it clear." }),
      phase({ segmentId: "seat", title: "Seat", instructions: "Carry the loop over the stump and meet it with the other instrument.", kind: "carry", position: v(0.02, 0.32), targetId: "stump-ring", requireAssist: true, live: "Carry the loop over the stump and bring the other instrument to it.", dropped: "Loop released early. Pick it up and seat it over the stump." }),
      phase({ segmentId: "cinch", title: "Cinch", instructions: "Lower the loop onto the stump.", kind: "place", position: v(0.02, 0.18), targetId: "stump-base", live: "Lower the loop onto the stump.", dropped: "Loop released in the air. Pick it up and cinch it down." }),
      phase({ segmentId: "release", title: "Release", instructions: "Open to leave the loop cinched on the stump.", kind: "release", position: v(0.02, 0.18), targetId: "stump-base", live: "Open your pinch to leave the loop on the stump.", dropped: "Loop released off the stump. Pick it up and release it on the base." }),
    ],
  }),
  buildTask({
    skillId: "clip-applying",
    title: "Clip Applying",
    description: "Pick up a clip, align it with the vessel mark, and close it across the mark.",
    category: "laparoscopic",
    difficulty: "beginner",
    estimatedMinutes: 5,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-clip",
    objectLabel: "Clip",
    objectNoun: "clip",
    objectKind: "clip",
    home: v(-0.22, 0.2),
    complete: "The clip is applied across the vessel mark.",
    demoMessage: "Learn demonstration: watch the clip travel from the rack to the vessel mark, or select Start attempt.",
    referenceLabel: "Synthetic clip-applying guide (not expert data)",
    coachHint: "Lift the clip before you cross the board, then set it flat on the vessel mark before you open.",
    steps: [
      "Reach the clip on the rack and pinch to grasp it.",
      "Lift it clear and carry it to the vessel mark.",
      "Lower it across the mark and open to apply it.",
    ],
    metricWeights: { pathSimilarity: 1.1, targetAccuracy: 1.4, gripTiming: 1.2, movementSmoothness: 1, toolCollisionAvoidance: 1 },
    coachingRules: ["clip-across-mark", "avoid-early-release", "stable-application"],
    phases: [
      phase({ segmentId: "reach", title: "Reach", instructions: "Move an open tip onto the clip.", kind: "reach", position: v(-0.22, 0.2), targetId: "practice-clip", live: "Move an open instrument tip onto the clip.", dropped: "Pick up the clip." }),
      phase({ segmentId: "grasp", title: "Grasp", instructions: "Pinch to grasp the clip on the rack.", kind: "grasp", position: v(-0.22, 0.2), targetId: "clip-rack", live: "Pinch to grasp the clip. The vessel mark does not count yet.", dropped: "The clip is free. Grasp it on the rack." }),
      phase({ segmentId: "lift", title: "Lift", instructions: "Lift the clip clear of the rack.", kind: "lift", position: v(-0.22, 0.2), targetId: "clip-rack", live: "Lift the clip off the rack before you cross.", dropped: "Clip released early. Pick it up and lift it." }),
      phase({ segmentId: "align", title: "Align", instructions: "Carry the clip to the vessel mark.", kind: "carry", position: v(0.08, 0.32), targetId: "vessel-approach", live: "Carry the clip toward the vessel mark.", dropped: "Clip released early. Pick it up and align it." }),
      phase({ segmentId: "apply", title: "Apply", instructions: "Lower the clip across the vessel mark.", kind: "place", position: v(0.2, 0.18), targetId: "vessel-mark", live: "Lower the clip across the vessel mark.", dropped: "Clip released off the mark. Pick it up and apply it." }),
      phase({ segmentId: "release", title: "Release", instructions: "Open to leave the clip on the mark.", kind: "release", position: v(0.2, 0.18), targetId: "vessel-mark", live: "Open your pinch to apply the clip.", dropped: "Clip released off the mark. Pick it up and release it on the vessel." }),
    ],
  }),
  buildTask({
    skillId: "needle-loading",
    title: "Needle Loading",
    description: "Grasp a needle, present it, and load it into the other instrument's jaws.",
    category: "fundamentals",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-load-needle",
    objectLabel: "Needle",
    objectNoun: "needle",
    objectKind: "needle",
    home: v(-0.2, 0.22),
    complete: "The needle is loaded into the other instrument.",
    demoMessage: "Learn demonstration: watch the needle move from the pad into the other instrument, or select Start attempt.",
    referenceLabel: "Synthetic needle-loading guide (not expert data)",
    coachHint: "Present the needle in space, then seat it where the other instrument can take it.",
    steps: [
      "Reach the needle on the pad and pinch to grasp it.",
      "Lift and present it in the middle of the field.",
      "Seat it on the load post and meet it with the other instrument, then open.",
    ],
    metricWeights: { pathSimilarity: 1, targetAccuracy: 1.2, bimanualCoordination: 1.5, gripTiming: 1.2, instrumentOrientationAccuracy: 1.1 },
    coachingRules: ["present-needle-curve", "load-into-driver", "bimanual-handoff"],
    phases: [
      phase({ segmentId: "reach", title: "Reach", instructions: "Move an open tip onto the needle.", kind: "reach", position: v(-0.2, 0.22), targetId: "practice-load-needle", live: "Move an open instrument tip onto the needle.", dropped: "Pick up the needle." }),
      phase({ segmentId: "grasp", title: "Grasp", instructions: "Pinch to grasp the needle on the pad.", kind: "grasp", position: v(-0.2, 0.22), targetId: "needle-pad", live: "Pinch to grasp the needle on the pad.", dropped: "The needle is free. Grasp it on the pad." }),
      phase({ segmentId: "orient", title: "Orient", instructions: "Lift the needle and present it in the middle of the field.", kind: "carry", position: v(0, 0.34), targetId: "present-zone", live: "Present the needle in the middle of the field.", dropped: "Needle released early. Pick it up and present it." }),
      phase({ segmentId: "load", title: "Load", instructions: "Seat the needle on the load post and meet it with the other instrument.", kind: "place", position: v(0.18, 0.2), targetId: "load-post", requireAssist: true, live: "Lower the needle onto the load post and bring the other instrument to it.", dropped: "Needle released off the post. Pick it up and load it." }),
      phase({ segmentId: "release", title: "Release", instructions: "Open to leave the needle with the other instrument.", kind: "release", position: v(0.18, 0.2), targetId: "load-post", live: "Open to hand the needle off.", dropped: "Needle released off the load post. Pick it up and release it there." }),
    ],
  }),
  buildTask({
    skillId: "tissue-retraction",
    title: "Tissue Retraction",
    description: "Grasp a tissue tab, lift it off the field, and hold it in the retract zone.",
    category: "fundamentals",
    difficulty: "beginner",
    estimatedMinutes: 5,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-tissue",
    objectLabel: "Tissue",
    objectNoun: "tissue tab",
    objectKind: "tissue",
    home: v(-0.18, 0.18),
    complete: "The tissue tab is held clear in the retract zone.",
    demoMessage: "Learn demonstration: watch the tab lift off the field and settle in the retract zone, or select Start attempt.",
    referenceLabel: "Synthetic tissue-retraction guide (not expert data)",
    coachHint: "Lift before you drag. Set the tab down only inside the retract zone.",
    steps: [
      "Reach the tissue tab and pinch to grasp it.",
      "Lift it clear of the field, then carry it to the retract zone.",
      "Lower it in the zone and open to leave it there.",
    ],
    metricWeights: { pathSimilarity: 1, targetAccuracy: 1.2, movementSmoothness: 1.2, gripTiming: 1.1, dangerZoneAvoidance: 1.3, toolCollisionAvoidance: 1 },
    coachingRules: ["lift-before-drag", "gentle-retraction", "stay-off-the-edge"],
    phases: [
      phase({ segmentId: "reach", title: "Reach", instructions: "Move an open tip onto the tissue tab.", kind: "reach", position: v(-0.18, 0.18), targetId: "practice-tissue", live: "Move an open instrument tip onto the tissue tab.", dropped: "Pick up the tissue tab." }),
      phase({ segmentId: "grasp", title: "Grasp", instructions: "Pinch to grasp the tissue tab.", kind: "grasp", position: v(-0.18, 0.18), targetId: "tissue-bed", live: "Pinch to grasp the tab. Dragging it along the bed does not count.", dropped: "The tab is free. Grasp it on the bed." }),
      phase({ segmentId: "lift", title: "Lift", instructions: "Lift the tab clear of the field.", kind: "lift", position: v(-0.18, 0.18), targetId: "tissue-bed", live: "Lift the tab straight up before you retract.", dropped: "Tab released early. Pick it up and lift it." }),
      phase({ segmentId: "retract", title: "Retract", instructions: "Carry the tab into the retract zone.", kind: "carry", position: v(0.16, 0.32), targetId: "retract-zone", live: "Carry the tab up into the retract zone.", dropped: "Tab released early. Pick it up and retract it." }),
      phase({ segmentId: "hold", title: "Hold", instructions: "Lower the tab inside the retract zone.", kind: "place", position: v(0.22, 0.2), targetId: "hold-pad", live: "Lower the tab onto the hold pad.", dropped: "Tab released outside the pad. Pick it up and hold it there." }),
      phase({ segmentId: "release", title: "Release", instructions: "Open to leave the tab on the hold pad.", kind: "release", position: v(0.22, 0.2), targetId: "hold-pad", live: "Open to leave the tab retracted.", dropped: "Tab released off the pad. Pick it up and release it on the pad." }),
    ],
  }),
  buildTask({
    skillId: "camera-navigation",
    title: "Camera Navigation",
    description: "Point an instrument tip at each landmark in order, as you would center a laparoscope.",
    category: "fundamentals",
    difficulty: "beginner",
    estimatedMinutes: 4,
    sourceLabel: synthetic,
    sourceLicense: syntheticLicense,
    objectId: "practice-scope-mark",
    objectLabel: "Scope",
    objectNoun: "scope mark",
    objectKind: "marker",
    home: v(-0.4, 0.18),
    complete: "Each landmark was centered in order.",
    demoMessage: "Learn demonstration: watch the tip visit each landmark, or select Start attempt.",
    referenceLabel: "Synthetic camera-navigation guide (not expert data)",
    coachHint: "Keep the jaws open and center one landmark at a time. Order matters.",
    steps: [
      "Center the tip on the survey mark at the upper left.",
      "Move to the vessel mark, then the target mark.",
      "Finish by centering the field mark.",
    ],
    metricWeights: { pathSimilarity: 1.2, targetAccuracy: 1.4, movementSmoothness: 1.1, pathEfficiency: 1.1, idleTimeControl: 1, handWorkspaceControl: 1 },
    coachingRules: ["center-the-target", "stable-horizon", "visit-in-order"],
    phases: [
      phase({ segmentId: "survey", title: "Survey", instructions: "Center an open tip on the upper-left survey mark.", kind: "trace", position: v(-0.16, 0.34), targetId: "survey-mark", live: "Center the tip on the survey mark.", dropped: "Find the survey mark." }),
      phase({ segmentId: "vessel", title: "Vessel", instructions: "Move to the vessel landmark.", kind: "trace", position: v(0.02, 0.26), targetId: "vessel-landmark", live: "Center the tip on the vessel landmark.", dropped: "Find the vessel landmark." }),
      phase({ segmentId: "target", title: "Target", instructions: "Move to the upper-right target.", kind: "trace", position: v(0.2, 0.34), targetId: "target-landmark", live: "Center the tip on the target landmark.", dropped: "Find the target landmark." }),
      phase({ segmentId: "center", title: "Center", instructions: "Finish on the field center.", kind: "trace", position: v(0.02, 0.18), targetId: "field-center", live: "Center the tip on the field mark.", dropped: "Find the field center." }),
    ],
  }),
];

const ROUTE_TASKS: ReadonlyMap<string, RouteTask> = new Map(ROUTE_TASK_LIST.map(task => [task.skillId, task]));

export function getRouteTask(skillId: string): RouteTask | undefined {
  return ROUTE_TASKS.get(skillId);
}

export function listRouteTasks(): readonly RouteTask[] {
  return ROUTE_TASK_LIST;
}

export function routeFixtureId(skillId: RouteSkillId): RouteFixtureId {
  return `${skillId}-good`;
}

export function validateRouteSkill(skill: SkillDefinition): SkillDefinition {
  const task = getRouteTask(skill.id);
  if (!task) throw new Error(`Unsupported skill configuration: ${skill.id}`);
  if (skill.segments.map(segment => segment.id).join(",") !== task.segmentIds.join(",")) {
    throw new Error(`Unsupported skill configuration: ${skill.id}`);
  }
  if (skill.sceneConfig.sceneId !== task.sceneId) throw new Error(`Unsupported skill configuration: ${skill.id}`);
  if (skill.sceneConfig.targetIds.join(",") !== task.targetIds.join(",")) {
    throw new Error(`Unsupported skill configuration: ${skill.id}`);
  }
  if (!skill.sceneConfig.dangerZoneIds.includes(task.danger.id)) {
    throw new Error(`Unsupported skill configuration: ${skill.id}`);
  }
  if (skill.referenceMotionId !== task.referenceMotionId) throw new Error(`Unsupported skill configuration: ${skill.id}`);
  return skill;
}

export function routeTargetPosition(skillId: string, activeTargetId: string | null): Vec3 | null {
  const task = getRouteTask(skillId);
  if (!task || !activeTargetId) return null;
  if (activeTargetId === task.objectId) return { ...task.home };
  const phaseMatch = task.phases.find(item => item.targetId === activeTargetId);
  return phaseMatch ? { ...phaseMatch.position } : null;
}

export function routeCorridorDeviation(task: RouteTask, point: Vec3): number {
  let best = Infinity;
  const line = task.corridor;
  if (line.length === 1) return pointDistance(point, line[0]);
  for (let index = 0; index < line.length - 1; index += 1) {
    best = Math.min(best, segmentDistance(point, line[index], line[index + 1]));
  }
  return best;
}

function segmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const abz = end.z - start.z;
  const lengthSq = abx * abx + aby * aby + abz * abz;
  if (lengthSq < 1e-8) return pointDistance(point, start);
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * abx + (point.y - start.y) * aby + (point.z - start.z) * abz) / lengthSq));
  return pointDistance(point, { x: start.x + abx * t, y: start.y + aby * t, z: start.z + abz * t });
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export interface RouteStepInput {
  task: RouteTask;
  segmentId: string;
  hadSegmentFrame: boolean;
  sawRelease: boolean;
  singleHand: boolean;
  leftTip: Vec3;
  rightTip: Vec3;
  objectPosition: Vec3;
  heldBy: string | null;
}

export interface RouteStep {
  segmentProgress: number;
  activeTargetId: string | null;
  dropped: boolean;
  liveInstruction: string;
  shouldAdvance: boolean;
  completedTargetId: string | null;
  corridorDeviation: number;
  inDangerZone: boolean;
  sawRelease: boolean;
}

export function stepRouteTask(input: RouteStepInput): RouteStep {
  const { task } = input;
  const current = task.phases.find(item => item.segmentId === input.segmentId);
  if (!current) throw new Error(`Route task ${task.skillId} has no phase ${input.segmentId}.`);
  const leftTip = input.leftTip;
  const rightTip = input.rightTip;
  const objectPosition = input.objectPosition;
  const held = input.heldBy !== null;
  const otherTip = input.heldBy === "left-tool" ? rightTip : input.heldBy === "right-tool" ? leftTip : null;
  const inDangerZone = pointInBox(leftTip, task.danger) || pointInBox(rightTip, task.danger) || (held && pointInBox(objectPosition, task.danger));
  const nearestTip = Math.min(pointDistance(leftTip, objectPosition), pointDistance(rightTip, objectPosition));
  const distObject = pointDistance(objectPosition, current.position);
  const assistMet = input.singleHand || (otherTip !== null && pointDistance(otherTip, objectPosition) <= ROUTE_THRESHOLDS.assistMeetRadius);
  const corridorPoint = held
    ? objectPosition
    : pointDistance(leftTip, current.position) <= pointDistance(rightTip, current.position) ? leftTip : rightTip;

  let segmentProgress = 0;
  let activeTargetId: string | null = current.targetId;
  let dropped = false;
  let liveInstruction = current.live;
  let shouldAdvance = false;
  let completedTargetId: string | null = null;
  let sawRelease = input.sawRelease;
  const radius = current.radius ?? defaultRadius(current.kind);

  if (current.kind === "reach") {
    activeTargetId = task.objectId;
    segmentProgress = clamp(1 - Math.max(0, nearestTip - radius) / 0.45);
    shouldAdvance = !inDangerZone && input.hadSegmentFrame && nearestTip <= radius;
  } else if (current.kind === "grasp") {
    activeTargetId = held ? current.targetId : task.objectId;
    if (!held) segmentProgress = nearestTip <= radius ? 0.45 : 0.15;
    else {
      segmentProgress = distObject <= radius ? 0.9 : 0.4;
      shouldAdvance = !inDangerZone && distObject <= radius;
      if (shouldAdvance) completedTargetId = current.targetId;
    }
  } else if (current.kind === "lift") {
    const clearance = current.clearance ?? ROUTE_THRESHOLDS.liftClearance;
    const lifted = objectPosition.y >= current.position.y + clearance;
    if (!held) {
      dropped = true;
      activeTargetId = task.objectId;
      liveInstruction = current.dropped;
    } else {
      segmentProgress = clamp((objectPosition.y - current.position.y) / clearance);
      shouldAdvance = !inDangerZone && lifted;
    }
  } else if (current.kind === "carry" || current.kind === "place") {
    if (!held) {
      dropped = true;
      activeTargetId = task.objectId;
      liveInstruction = current.dropped;
    } else if (current.kind === "carry") {
      const meetScore = current.requireAssist ? (assistMet ? 1 : 0.35) : 1;
      const posScore = clamp(1 - Math.max(0, distObject - radius) / 0.28);
      segmentProgress = current.requireAssist ? 0.5 * posScore + 0.5 * meetScore : posScore;
      shouldAdvance = !inDangerZone && distObject <= radius && (!current.requireAssist || assistMet);
      if (shouldAdvance) completedTargetId = current.targetId;
    } else {
      const slack = current.heightSlack ?? ROUTE_THRESHOLDS.placeHeightSlack;
      const lowEnough = objectPosition.y <= current.position.y + slack;
      const meetScore = current.requireAssist ? (assistMet ? 1 : 0.35) : 1;
      segmentProgress = (current.requireAssist ? 0.34 : 0.5) * clamp(1 - Math.max(0, distObject - radius) / 0.25)
        + (current.requireAssist ? 0.33 : 0.5) * (lowEnough ? 1 : clamp(1 - (objectPosition.y - current.position.y) / 0.2, 0, 0.8))
        + (current.requireAssist ? 0.33 * meetScore : 0);
      shouldAdvance = !inDangerZone && distObject <= radius && lowEnough && (!current.requireAssist || assistMet);
      if (shouldAdvance) completedTargetId = current.targetId;
    }
  } else if (current.kind === "release") {
    const slack = current.heightSlack ?? ROUTE_THRESHOLDS.placeHeightSlack;
    const onTarget = distObject <= radius + 0.01 && objectPosition.y <= current.position.y + slack + 0.02;
    activeTargetId = held || onTarget ? current.targetId : task.objectId;
    if (held) segmentProgress = onTarget ? 0.7 : 0.25;
    else if (onTarget && !inDangerZone) {
      segmentProgress = 1;
      shouldAdvance = true;
    } else {
      dropped = true;
      segmentProgress = 0.2;
      liveInstruction = current.dropped;
    }
  } else if (current.kind === "regrasp") {
    if (!held) sawRelease = true;
    const near = distObject <= radius;
    if (!sawRelease) segmentProgress = 0.2;
    else if (!held) {
      activeTargetId = task.objectId;
      segmentProgress = near ? 0.55 : 0.2;
      if (!near) {
        dropped = true;
        liveInstruction = current.dropped;
      }
    } else if (near && !inDangerZone) {
      segmentProgress = 1;
      shouldAdvance = true;
      completedTargetId = current.targetId;
    } else segmentProgress = 0.4;
  } else {
    const markDistance = Math.min(pointDistance(leftTip, current.position), pointDistance(rightTip, current.position));
    segmentProgress = clamp(1 - Math.max(0, markDistance - radius) / 0.35);
    shouldAdvance = !inDangerZone && input.hadSegmentFrame && markDistance <= radius;
    if (shouldAdvance) completedTargetId = current.targetId;
  }

  if (inDangerZone) {
    liveInstruction = "Danger zone: lift both instruments off the board edge.";
    shouldAdvance = false;
  }

  return {
    segmentProgress,
    activeTargetId,
    dropped,
    liveInstruction,
    shouldAdvance,
    completedTargetId,
    corridorDeviation: routeCorridorDeviation(task, corridorPoint),
    inDangerZone,
    sawRelease,
  };
}

function defaultRadius(kind: RoutePhaseKind): number {
  if (kind === "reach") return ROUTE_THRESHOLDS.reachRadius;
  if (kind === "grasp" || kind === "regrasp") return ROUTE_THRESHOLDS.graspRadius;
  if (kind === "trace") return ROUTE_THRESHOLDS.traceRadius;
  if (kind === "place" || kind === "release") return ROUTE_THRESHOLDS.placeRadius;
  return ROUTE_THRESHOLDS.carryRadius;
}

export interface RouteWaypoint {
  tip: Vec3;
  closed: boolean;
  rotDeg: number;
  rightTip: Vec3;
}

function lerp(a: Vec3, b: Vec3, u: number): Vec3 {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

/** Fixed synthetic control path that clears every phase gate for this task. */
export function buildRouteFixtureWaypoints(task: RouteTask): RouteWaypoint[] {
  const samples: RouteWaypoint[] = [];
  const pushSpan = (count: number, evalStep: (u: number) => RouteWaypoint) => {
    for (let index = 0; index < count; index += 1) {
      samples.push(evalStep(count > 1 ? index / (count - 1) : 1));
    }
  };
  const home = { ...task.home };
  const park = { x: home.x > 0.05 ? -0.48 : 0.45, y: 0.32, z: 0 };
  let cursor = { ...home };

  for (const item of task.phases) {
    if (item.kind === "reach") {
      const start = { x: home.x - 0.26, y: home.y + 0.06, z: 0 };
      pushSpan(8, u => ({ tip: lerp(start, home, u), closed: false, rotDeg: 0, rightTip: park }));
      cursor = { ...home };
    } else if (item.kind === "grasp") {
      pushSpan(6, u => ({ tip: { ...home }, closed: u > 0.34, rotDeg: 0, rightTip: park }));
      cursor = { ...home };
    } else if (item.kind === "lift") {
      const lifted = { x: home.x, y: home.y + (item.clearance ?? ROUTE_THRESHOLDS.liftClearance) + 0.05, z: 0 };
      pushSpan(8, u => ({ tip: lerp(cursor, lifted, u), closed: true, rotDeg: 0, rightTip: park }));
      cursor = lifted;
    } else if (item.kind === "carry" || item.kind === "place") {
      const dest = { ...item.position };
      const rightDest = item.requireAssist ? { x: dest.x + 0.04, y: dest.y, z: 0 } : park;
      pushSpan(10, u => ({ tip: lerp(cursor, dest, u), closed: true, rotDeg: 0, rightTip: lerp(park, rightDest, u) }));
      if (item.kind === "place") pushSpan(4, () => ({ tip: dest, closed: true, rotDeg: 0, rightTip: rightDest }));
      cursor = dest;
    } else if (item.kind === "release") {
      pushSpan(3, () => ({ tip: { ...cursor }, closed: false, rotDeg: 0, rightTip: park }));
    } else if (item.kind === "regrasp") {
      const spot = { ...item.position };
      if (pointDistance(cursor, spot) > 0.02) {
        pushSpan(6, u => ({ tip: lerp(cursor, spot, u), closed: true, rotDeg: 0, rightTip: park }));
      }
      pushSpan(3, () => ({ tip: spot, closed: false, rotDeg: 0, rightTip: park }));
      pushSpan(5, u => ({ tip: spot, closed: u > 0.2, rotDeg: 0, rightTip: park }));
      cursor = spot;
    } else {
      const dest = { ...item.position };
      pushSpan(8, u => ({ tip: lerp(cursor, dest, u), closed: false, rotDeg: 0, rightTip: park }));
      pushSpan(3, () => ({ tip: dest, closed: false, rotDeg: 0, rightTip: park }));
      cursor = dest;
    }
  }
  return samples;
}

export const suturingSkill = ROUTE_TASK_LIST[0].skill;
export const knotTyingSkill = ROUTE_TASK_LIST[1].skill;
export const patternCuttingSkill = ROUTE_TASK_LIST[2].skill;
export const ligatingLoopSkill = ROUTE_TASK_LIST[3].skill;
export const clipApplyingSkill = ROUTE_TASK_LIST[4].skill;
export const needleLoadingSkill = ROUTE_TASK_LIST[5].skill;
export const tissueRetractionSkill = ROUTE_TASK_LIST[6].skill;
export const cameraNavigationSkill = ROUTE_TASK_LIST[7].skill;
