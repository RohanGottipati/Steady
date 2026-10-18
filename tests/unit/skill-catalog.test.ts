import { describe, expect, it } from "vitest";
import {
  getCatalogEntry,
  getDefinedSkillIds,
  getSkillCatalog,
  getSkillDefinition,
} from "@/lib/skills/catalog";
import { skillCatalogEntrySchema } from "@/lib/skills/types";

describe("skill catalog", () => {
  it("lists every trainable skill in a stable order", () => {
    const ids = getSkillCatalog().map((e) => e.id);
    expect(ids).toEqual([
      "needle-passing",
      "suturing",
      "knot-tying",
      "peg-transfer",
      "pattern-cutting",
      "ligating-loop",
      "clip-applying",
      "needle-loading",
      "tissue-retraction",
      "camera-navigation",
    ]);
  });

  it("marks every listed skill available", () => {
    for (const entry of getSkillCatalog()) {
      expect(entry.status).toBe("available");
    }
  });

  it("validates every entry against the SkillCatalogEntry schema", () => {
    for (const entry of getSkillCatalog()) {
      expect(() => skillCatalogEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it("returns a full SkillDefinition only for available skills", () => {
    expect(getSkillDefinition("needle-passing")?.id).toBe("needle-passing");
    expect(getSkillDefinition("peg-transfer")?.id).toBe("peg-transfer");
    expect(getSkillDefinition("peg-transfer")?.segments.map(segment => segment.id)).toEqual([
      "reach", "grasp", "lift", "transfer", "place", "release", "complete",
    ]);
    expect(getSkillDefinition("suturing")?.segments[0]?.id).toBe("orient");
    expect(getSkillDefinition("knot-tying")?.segments[0]?.id).toBe("loop");
    expect(getSkillDefinition("pattern-cutting")?.id).toBe("pattern-cutting");
  });

  it("returns undefined for an unknown skill id", () => {
    expect(getCatalogEntry("does-not-exist")).toBeUndefined();
    expect(getSkillDefinition("does-not-exist")).toBeUndefined();
  });

  it("derives available catalog entries from their SkillDefinition (no drift)", () => {
    for (const entry of getSkillCatalog()) {
      if (entry.status !== "available") continue;
      const def = getSkillDefinition(entry.id);
      expect(def).toBeDefined();
      expect(entry.title).toBe(def!.title);
      expect(entry.description).toBe(def!.description);
      expect(entry.category).toBe(def!.category);
      expect(entry.difficulty).toBe(def!.difficulty);
      expect(entry.estimatedMinutes).toBe(def!.estimatedMinutes);
      expect(entry.availableModes).toEqual(def!.availableModes);
      expect(entry.sourceLabel).toBe(def!.sourceLabel);
    }
  });

  it("keeps availability and SkillDefinition presence in sync (available ⇔ definition)", () => {
    for (const entry of getSkillCatalog()) {
      if (entry.status === "available") {
        expect(getSkillDefinition(entry.id)).toBeDefined();
      } else {
        expect(getSkillDefinition(entry.id)).toBeUndefined();
      }
    }
    // Reverse: every defined skill is an available catalog entry.
    for (const id of getDefinedSkillIds()) {
      expect(getCatalogEntry(id)?.status).toBe("available");
    }
  });
});
