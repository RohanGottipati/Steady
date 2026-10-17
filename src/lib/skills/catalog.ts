import { SKILL_CATALOG } from "@/data/skill-catalog";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { SkillDefinition } from "@/types/skill";
import type { SkillCatalogEntry } from "./types";

// Full training definitions, keyed by id. Only skills with a reference motion
// appear here; catalog entries without one are "coming-soon".
const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
  [needlePassingSkill.id]: needlePassingSkill,
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

export function isSkillAvailable(id: string): boolean {
  return getCatalogEntry(id)?.status === "available";
}

export function getDefinedSkillIds(): string[] {
  return Object.keys(SKILL_DEFINITIONS);
}
