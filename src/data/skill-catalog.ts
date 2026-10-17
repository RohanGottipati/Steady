import type { SkillCatalogEntry } from "@/lib/skills/types";

// Ordered Surgical Skills Library. Only needle-passing has a reference motion
// today; the rest are "coming-soon" until their datasets/references land
// (plan 1.4). Keep this data-driven — the UI renders whatever is listed here.
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  {
    id: "needle-passing",
    title: "Needle Passing",
    description:
      "Pass a needle through target rings with precise bimanual control and smooth wrist rotation.",
    category: "suturing",
    difficulty: "beginner",
    estimatedMinutes: 6,
    availableModes: ["learn", "practice", "assessment"],
    sourceLabel: "Internal reference",
    sourceLicense: "Internal recording",
    status: "available",
  },
  {
    id: "suturing",
    title: "Suturing",
    description:
      "Place and tension sutures along a wound line with consistent spacing and bite depth.",
    category: "suturing",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    availableModes: ["learn", "practice", "assessment"],
    sourceLabel: "JIGSAWS",
    sourceLicense: "Academic license pending",
    status: "coming-soon",
  },
  {
    id: "knot-tying",
    title: "Knot Tying",
    description:
      "Tie secure surgical knots with controlled tension and clean instrument handling.",
    category: "suturing",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    availableModes: ["learn", "practice", "assessment"],
    sourceLabel: "JIGSAWS",
    sourceLicense: "Academic license pending",
    status: "coming-soon",
  },
  {
    id: "peg-transfer",
    title: "Peg Transfer",
    description:
      "Transfer pegs between pegboard posts with bimanual coordination and minimal collisions.",
    category: "laparoscopic",
    difficulty: "beginner",
    estimatedMinutes: 5,
    availableModes: ["learn", "practice", "assessment"],
    sourceLabel: "LASK",
    sourceLicense: "CC BY 4.0",
    status: "coming-soon",
  },
];
