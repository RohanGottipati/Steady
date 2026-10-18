import type { SkillCatalogEntry } from "@/lib/skills/types";
import { SkillCard as ProductSkillCard } from "@/components/product/library/SkillCard";
import { presentSkill } from "@/components/product/data/skills";
export function SkillCard({ skill }: { skill: SkillCatalogEntry }) {
  return <ProductSkillCard skill={presentSkill(skill)} />;
}
