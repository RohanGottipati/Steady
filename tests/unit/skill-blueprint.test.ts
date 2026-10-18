import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_CREDITS } from "@/lib/credits";
import {
  getCatalogEntry,
  getSkillBlueprint,
  getSkillCatalog,
  getSkillDefinition,
} from "@/lib/skills/catalog";
import { PERFORMANCE_VECTOR_ORDER } from "@/types/evaluation";
import { skillBlueprintSchema } from "@/types/skill";

const CANONICAL_METRIC_IDS = new Set<string>(PERFORMANCE_VECTOR_ORDER);
const BLUEPRINT_SKILL_IDS = ["suturing", "knot-tying"] as const;

describe("B11 skill blueprints", () => {
  it("authors a blueprint for each coming-soon JIGSAWS skill", () => {
    for (const id of BLUEPRINT_SKILL_IDS) {
      const blueprint = getSkillBlueprint(id);
      expect(blueprint, `expected a blueprint for ${id}`).toBeDefined();
      expect(() => skillBlueprintSchema.parse(blueprint)).not.toThrow();
      expect(blueprint!.segments.length).toBeGreaterThan(1);
      expect(Object.keys(blueprint!.metricWeights).length).toBeGreaterThan(0);
      expect(blueprint!.coachingRules.length).toBeGreaterThan(0);
    }
  });

  it("has no blueprint for functional skills or unknown ids", () => {
    expect(getSkillBlueprint("needle-passing")).toBeUndefined();
    expect(getSkillBlueprint("peg-transfer")).toBeUndefined();
    expect(getSkillBlueprint("does-not-exist")).toBeUndefined();
  });

  it("weights only canonical performance metrics with positive weights", () => {
    for (const id of BLUEPRINT_SKILL_IDS) {
      const { metricWeights } = getSkillBlueprint(id)!;
      for (const [metricId, weight] of Object.entries(metricWeights)) {
        expect(CANONICAL_METRIC_IDS.has(metricId), `${id}: ${metricId}`).toBe(true);
        expect(Number.isFinite(weight)).toBe(true);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it("points at a committed JIGSAWS reference whose id and skill match", () => {
    for (const id of BLUEPRINT_SKILL_IDS) {
      const blueprint = getSkillBlueprint(id)!;
      const file = path.join(
        process.cwd(),
        "public",
        "references",
        id,
        `${blueprint.referenceMotionId}.json`,
      );
      const ref = JSON.parse(readFileSync(file, "utf8"));
      expect(ref.id).toBe(blueprint.referenceMotionId);
      expect(ref.skillId).toBe(id);
    }
  });

  it("carries the required JIGSAWS attribution", () => {
    for (const id of BLUEPRINT_SKILL_IDS) {
      const { attribution } = getSkillBlueprint(id)!;
      expect(attribution).toMatch(/JIGSAWS/);
      expect(attribution).toMatch(/Gao/);
    }
  });
});

describe("B11 library acceptance", () => {
  it("every card is either a functional skill or a clearly-marked unavailable one with a preview", () => {
    for (const entry of getSkillCatalog()) {
      if (entry.status === "available") {
        // Functional: resolves to a full, launchable training definition.
        expect(getSkillDefinition(entry.id)).toBeDefined();
      } else {
        // Clearly marked unavailable, but not a dead end: carries a preview blueprint.
        expect(entry.status).toBe("coming-soon");
        expect(getSkillDefinition(entry.id)).toBeUndefined();
        expect(getSkillBlueprint(entry.id)).toBeDefined();
      }
    }
  });

  it("marks every coming-soon catalog entry as such and keeps it listed", () => {
    for (const id of BLUEPRINT_SKILL_IDS) {
      expect(getCatalogEntry(id)?.status).toBe("coming-soon");
    }
  });
});

describe("B11 attribution coverage", () => {
  it("credits JIGSAWS for the coming-soon suturing and knot-tying skills", () => {
    const jigsaws = PRODUCT_CREDITS.find((credit) => credit.id === "jigsaws");
    expect(jigsaws).toBeDefined();
    expect(jigsaws!.text).toMatch(/Suturing/);
    expect(jigsaws!.text).toMatch(/Knot Tying/);
  });
});
