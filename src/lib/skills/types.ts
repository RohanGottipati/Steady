import { z } from "zod";
import {
  skillCategorySchema,
  skillDifficultySchema,
  trainingModeSchema,
} from "@/types/skill";

// Lightweight entry for the Surgical Skills Library listing. Distinct from the
// full SkillDefinition contract so "coming soon" skills (no reference motion
// yet) can appear without a complete training definition.
export const skillCatalogEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: skillCategorySchema,
  difficulty: skillDifficultySchema,
  estimatedMinutes: z.number().positive(),
  availableModes: z.array(trainingModeSchema).min(1),
  sourceLabel: z.string().min(1),
  sourceLicense: z.string().min(1),
  status: z.enum(["available", "coming-soon"]),
});

export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>;
