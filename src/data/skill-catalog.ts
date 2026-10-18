import { cameraNavigationSkill } from "@/data/skills/camera-navigation";
import { clipApplyingSkill } from "@/data/skills/clip-applying";
import { knotTyingSkill } from "@/data/skills/knot-tying";
import { ligatingLoopSkill } from "@/data/skills/ligating-loop";
import { needleLoadingSkill } from "@/data/skills/needle-loading";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { patternCuttingSkill } from "@/data/skills/pattern-cutting";
import { pegTransferSkill } from "@/data/skills/peg-transfer";
import { suturingSkill } from "@/data/skills/suturing";
import { tissueRetractionSkill } from "@/data/skills/tissue-retraction";
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

const syntheticLicense = "Repository-authored synthetic guide. Not expert data.";
const jigsawsLicense =
  "Repository-authored scene guide. The committed JIGSAWS file is academic, non-commercial, and is not the scoring reference.";

// Ordered Surgical Skills Library. Every entry launches a trainer on the shared runtime.
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  availableEntry(needlePassingSkill, "Repository-authored"),
  availableEntry(suturingSkill, jigsawsLicense),
  availableEntry(knotTyingSkill, jigsawsLicense),
  availableEntry(
    pegTransferSkill,
    "Internal synthetic fixture (LASK adapter format; real LASK dataset not acquired)",
  ),
  availableEntry(patternCuttingSkill, syntheticLicense),
  availableEntry(ligatingLoopSkill, syntheticLicense),
  availableEntry(clipApplyingSkill, syntheticLicense),
  availableEntry(needleLoadingSkill, syntheticLicense),
  availableEntry(tissueRetractionSkill, syntheticLicense),
  availableEntry(cameraNavigationSkill, syntheticLicense),
];
