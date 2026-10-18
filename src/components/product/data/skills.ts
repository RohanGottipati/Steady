import {
  getSkillCatalog,
  getSkillDefinition,
  getSkillBlueprint,
} from "@/lib/skills/catalog";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import type { Skill } from "../types/training";
export function presentSkill(entry: SkillCatalogEntry): Skill {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    status: entry.status,
    level: entry.difficulty,
    minutes: entry.estimatedMinutes,
    category: entry.category,
    source: entry.sourceLabel,
    segments:
      (getSkillDefinition(entry.id) ?? getSkillBlueprint(entry.id))?.segments ??
      [],
  };
}
export const skills = getSkillCatalog().map(presentSkill);
export const MODE_INFO = [
  {
    id: "learn",
    label: "Learn",
    description: "Watch the ghost demonstration, then follow the guide.",
  },
  {
    id: "practice",
    label: "Practice",
    description: "Practice independently with optional ghost assistance.",
  },
  {
    id: "assessment",
    label: "Assessment",
    description: "Measure your motion without guides or live coaching.",
  },
] as const;
