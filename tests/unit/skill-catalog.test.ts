import { describe, expect, it } from "vitest";
import {
  getCatalogEntry,
  getSkillCatalog,
  getSkillDefinition,
} from "@/lib/skills/catalog";
import { skillCatalogEntrySchema } from "@/lib/skills/types";

describe("skill catalog", () => {
  it("lists all four planned skills in a stable order", () => {
    const ids = getSkillCatalog().map((e) => e.id);
    expect(ids).toEqual(["needle-passing", "suturing", "knot-tying", "peg-transfer"]);
  });

  it("marks the needle-passing skill available and the rest coming-soon", () => {
    expect(getCatalogEntry("needle-passing")?.status).toBe("available");
    expect(getCatalogEntry("suturing")?.status).toBe("coming-soon");
    expect(getCatalogEntry("knot-tying")?.status).toBe("coming-soon");
    expect(getCatalogEntry("peg-transfer")?.status).toBe("coming-soon");
  });

  it("validates every entry against the SkillCatalogEntry schema", () => {
    for (const entry of getSkillCatalog()) {
      expect(() => skillCatalogEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("returns a full SkillDefinition only for available skills", () => {
    expect(getSkillDefinition("needle-passing")?.id).toBe("needle-passing");
    expect(getSkillDefinition("suturing")).toBeUndefined();
  });

  it("returns undefined for an unknown skill id", () => {
    expect(getCatalogEntry("does-not-exist")).toBeUndefined();
    expect(getSkillDefinition("does-not-exist")).toBeUndefined();
  });
});
