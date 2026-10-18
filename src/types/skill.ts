import { z } from "zod";

export const trainingModeSchema = z.enum(["learn", "practice", "assessment"]);

export type TrainingMode = z.infer<typeof trainingModeSchema>;

export const skillCategorySchema = z.enum([
  "suturing",
  "laparoscopic",
  "fundamentals",
]);

export type SkillCategory = z.infer<typeof skillCategorySchema>;

export const skillDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export type SkillDifficulty = z.infer<typeof skillDifficultySchema>;

/**
 * Skill-defined segment id. Validated against SkillDefinition.segments at runtime.
 * Not a global enum — each skill owns its sequence.
 */
export type ExerciseSegment = string;

export const needlePassingSegmentSchema = z.enum([
  "approach",
  "grip",
  "align",
  "entry",
  "rotation",
  "exit",
  "release",
  "complete",
]);

export type NeedlePassingSegment = z.infer<typeof needlePassingSegmentSchema>;

export const skillSegmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string(),
});

export const skillDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  category: skillCategorySchema,
  difficulty: skillDifficultySchema,
  estimatedMinutes: z.number().positive(),
  referenceMotionId: z.string().min(1),
  sourceLabel: z.string(),
  availableModes: z.array(trainingModeSchema).min(1),
  segments: z.array(skillSegmentSchema).min(1),
  metricWeights: z.record(z.string(), z.number()),
  coachingRules: z.array(z.string()),
  sceneConfig: z.object({
    sceneId: z.string().min(1),
    targetIds: z.array(z.string()),
    dangerZoneIds: z.array(z.string()),
  }),
});

export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

/**
 * Authored training design for a skill that is listed but not yet trainable
 * (no scene, so no launchable SkillDefinition). It holds the parts of a skill
 * B11 can deliver honestly — phase segments, metric weights, coaching rules,
 * and the committed expert reference it is built from with attribution — so the
 * library can show a real "what you'll practice / how it's scored" preview and
 * flip to a full SkillDefinition once a scene lands. No sceneConfig: a blueprint
 * never scores or launches.
 */
export const skillBlueprintSchema = z.object({
  id: z.string().min(1),
  referenceMotionId: z.string().min(1),
  sourceLabel: z.string().min(1),
  attribution: z.string().min(1),
  segments: z.array(skillSegmentSchema).min(1),
  metricWeights: z.record(z.string(), z.number().positive()),
  coachingRules: z.array(z.string()).min(1),
});

export type SkillBlueprint = z.infer<typeof skillBlueprintSchema>;
