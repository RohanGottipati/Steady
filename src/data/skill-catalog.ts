import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import type { SkillDefinition } from "@/types/skill";

// For skills that have a full definition, derive the library's shared fields
// from it so metadata cannot drift. The catalog only adds listing-specific
// fields (source license, availability).
function availableEntry(
  def: SkillDefinition,
  sourceLicense: string,
): SkillCatalogEntry {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
    difficulty: def.difficulty,
    estimatedMinutes: def.estimatedMinutes,
    availableModes: def.availableModes,
    sourceLabel: def.sourceLabel,
    sourceLicense,
    status: "available",
  };
}

// Ordered Surgical Skills Library. Only needle-passing is product-wired (full
// SkillDefinition + scene) today. Suturing and knot-tying have real JIGSAWS
// expert reference data committed (data-only, see docs/DATA_LICENSES.md) but stay
// "coming-soon" until their trainer scenes land (plan 1.4). Keep this data-driven
// — the UI renders whatever is listed here.
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  availableEntry(needlePassingSkill, "Internal recording"),
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
    sourceLicense: "JIGSAWS (academic, non-commercial) — expert reference data ready; trainer wiring pending",
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
    sourceLicense: "JIGSAWS (academic, non-commercial) — expert reference data ready; trainer wiring pending",
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
