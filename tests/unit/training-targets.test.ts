import { describe, expect, it } from "vitest";
import { trainingTargetKind, TISSUE_PAD, TISSUE_PAD_SURFACE_BASE_Z, PEG_BOARD_TOP_Z } from "@/data/training-targets";
import { NEEDLE_PASSING_RINGS, TISSUE_WALL_ZONE } from "@/lib/exercise/needle-passing-config";
import { BOARD_EDGE_ZONE } from "@/lib/exercise/peg-transfer-config";
import { tissuePadSurfaceZ } from "@/components/scene/targets/synthetic-tissue-pad";

describe("trainingTargetKind", () => {
  it.each([
    ["needle-passing", "synthetic-tissue-pad"],
    ["suturing", "synthetic-tissue-pad"],
    ["knot-tying", "tissue-knot-trainer"],
    ["peg-transfer", "peg-transfer-board"],
    ["cholecystectomy", "surgical-anatomy"],
    ["unknown-skill", "fallback"],
  ])("maps %s to %s", (skill, kind) => {
    expect(trainingTargetKind(skill)).toBe(kind);
  });

  it("defaults to the needle-passing tissue pad", () => {
    expect(trainingTargetKind()).toBe("synthetic-tissue-pad");
  });
});

describe("visual target placement", () => {
  it("keeps the tissue surface below every needle-passing checkpoint", () => {
    for (const ring of NEEDLE_PASSING_RINGS) {
      expect(tissuePadSurfaceZ(ring.position.x, ring.position.y)).toBeLessThan(ring.position.z - 0.02);
    }
  });

  it("covers the needle-passing rings and tissue-wall band with the pad footprint", () => {
    const [cx, cy] = TISSUE_PAD.center;
    for (const { position } of NEEDLE_PASSING_RINGS) {
      expect(Math.abs(position.x - cx)).toBeLessThan(TISSUE_PAD.width / 2);
      expect(Math.abs(position.y - cy)).toBeLessThan(TISSUE_PAD.depth / 2);
    }
    expect(TISSUE_WALL_ZONE.halfExtents.x).toBeLessThan(TISSUE_PAD.width / 2);
  });

  it("places visual surfaces under the canonical working plane", () => {
    expect(TISSUE_PAD_SURFACE_BASE_Z + TISSUE_PAD.domeHeight).toBeLessThan(0);
    expect(PEG_BOARD_TOP_Z).toBeLessThan(BOARD_EDGE_ZONE.center.z + BOARD_EDGE_ZONE.halfExtents.z);
  });
});
