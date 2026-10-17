import { needlePassingSkill } from "@/data/skills/needle-passing";
import { pegTransferSkill } from "@/data/skills/peg-transfer";
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

// Ordered Surgical Skills Library. Needle Passing and Peg Transfer are
// product-wired (SkillDefinition + scene + reference). Suturing and knot-tying
// have real JIGSAWS expert reference data committed (data-only, see
// docs/DATA_LICENSES.md) but stay "coming-soon" until their trainer scenes land.
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  availableEntry(needlePassingSkill, "Repository-authored"),
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
    sourceLicense: "JIGSAWS, academic non-commercial use. Not ready to train.",
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
    sourceLicense: "JIGSAWS, academic non-commercial use. Not ready to train.",
    status: "coming-soon",
  },
  availableEntry(
    pegTransferSkill,
    "Internal synthetic fixture (LASK adapter format; real LASK dataset not acquired)",
  ),
];
