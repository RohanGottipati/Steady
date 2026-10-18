import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_CREDITS } from "@/lib/credits";
import {
  getSkillBlueprint,
  getSkillCatalog,
  getSkillDefinition,
} from "@/lib/skills/catalog";
import { PERFORMANCE_VECTOR_ORDER } from "@/types/evaluation";

const CANONICAL_METRIC_IDS = new Set<string>(PERFORMANCE_VECTOR_ORDER);
const JIGSAWS_SKILL_IDS = ["suturing", "knot-tying"] as const;

describe("JIGSAWS skill references", () => {
  it("keeps the committed expert files as data, not as the scoring blueprint", () => {
    for (const id of JIGSAWS_SKILL_IDS) {
      expect(getSkillBlueprint(id)).toBeUndefined();
      const definition = getSkillDefinition(id);
      expect(definition?.referenceMotionId).toBe(`${id}-reference-v1`);
      const file = path.join(process.cwd(), "public", "references", id, `${id}-jigsaws-expert-v1.json`);
      const ref = JSON.parse(readFileSync(file, "utf8"));
      expect(ref.id).toBe(`${id}-jigsaws-expert-v1`);
      expect(ref.skillId).toBe(id);
      expect(ref.sourceType).toBe("dataset");
    }
  });

  it("weights only canonical performance metrics on the trainable definitions", () => {
    for (const id of JIGSAWS_SKILL_IDS) {
      const { metricWeights } = getSkillDefinition(id)!;
      for (const [metricId, weight] of Object.entries(metricWeights)) {
        expect(CANONICAL_METRIC_IDS.has(metricId), `${id}: ${metricId}`).toBe(true);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });
});

describe("library availability", () => {
  it("gives every listed skill a launchable definition and no preview blueprint", () => {
    for (const entry of getSkillCatalog()) {
      expect(entry.status).toBe("available");
      expect(getSkillDefinition(entry.id)?.id).toBe(entry.id);
      expect(getSkillBlueprint(entry.id)).toBeUndefined();
    }
  });
});

describe("JIGSAWS attribution coverage", () => {
  it("credits JIGSAWS for suturing and knot tying", () => {
    const jigsaws = PRODUCT_CREDITS.find((credit) => credit.id === "jigsaws");
    expect(jigsaws).toBeDefined();
    expect(jigsaws!.text).toMatch(/Suturing/);
    expect(jigsaws!.text).toMatch(/Knot Tying/);
  });
});
