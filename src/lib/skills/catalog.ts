import { SKILL_CATALOG } from "@/data/skill-catalog";
import { knotTyingBlueprint } from "@/data/skills/knot-tying";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import { pegTransferSkill } from "@/data/skills/peg-transfer";
import { suturingBlueprint } from "@/data/skills/suturing";
import type { SkillBlueprint, SkillDefinition } from "@/types/skill";
import type { SkillCatalogEntry } from "./types";

// Full training definitions, keyed by id. Only skills with a scene and reference
// motion appear here; catalog entries without one are "coming-soon".
const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
  [needlePassingSkill.id]: needlePassingSkill,
  [pegTransferSkill.id]: pegTransferSkill,
};

// Authored designs for coming-soon skills (B11): real phases, metric weights,
// and attributed expert references, but no scene yet — so they preview in the
// library without being launchable. A skill has a definition or a blueprint,
// never both.
const SKILL_BLUEPRINTS: Record<string, SkillBlueprint> = {
  [suturingBlueprint.id]: suturingBlueprint,
  [knotTyingBlueprint.id]: knotTyingBlueprint,
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

export function getSkillBlueprint(id: string): SkillBlueprint | undefined {
  return SKILL_BLUEPRINTS[id];
}

export function getDefinedSkillIds(): string[] {
  return Object.keys(SKILL_DEFINITIONS);
}
