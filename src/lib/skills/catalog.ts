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
import { SKILL_CATALOG } from "@/data/skill-catalog";
import type { SkillDefinition } from "@/types/skill";
import type { SkillCatalogEntry } from "./types";

// Full training definitions, keyed by id. A catalog entry is available only
// when it has a scene, a reference motion, and a definition here.
const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
  [needlePassingSkill.id]: needlePassingSkill,
  [suturingSkill.id]: suturingSkill,
  [knotTyingSkill.id]: knotTyingSkill,
  [pegTransferSkill.id]: pegTransferSkill,
  [patternCuttingSkill.id]: patternCuttingSkill,
  [ligatingLoopSkill.id]: ligatingLoopSkill,
  [clipApplyingSkill.id]: clipApplyingSkill,
  [needleLoadingSkill.id]: needleLoadingSkill,
  [tissueRetractionSkill.id]: tissueRetractionSkill,
  [cameraNavigationSkill.id]: cameraNavigationSkill,
};

export function getSkillCatalog(): readonly SkillCatalogEntry[] {
  return SKILL_CATALOG;
}

export function getCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((entry) => entry.id === id);
}

export function getSkillDefinition(id: string): SkillDefinition | undefined {
  return SKILL_DEFINITIONS[id];
}

export function getSkillBlueprint(id: string): undefined {
  void id;
  return undefined;
}

export function isSkillAvailable(id: string): boolean {
  return getCatalogEntry(id)?.status === "available";
}

export function getDefinedSkillIds(): string[] {
  return Object.keys(SKILL_DEFINITIONS);
}
