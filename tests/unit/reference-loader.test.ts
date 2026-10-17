import { describe, expect, it } from "vitest";
import { parseReference } from "@/lib/references/load-reference";
import { COORDINATE_SYSTEM } from "@/types/geometry";
import { DATA_SCHEMA_VERSION } from "@/types/schema-version";
import type { ToolState } from "@/types/tool";

function tool(id: ToolState["id"]): ToolState {
  return {
    id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    tipPosition: { x: 0, y: 0, z: 0 },
    jawClosed: false,
  };
}

function validReference() {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: "needle-passing-reference-v1",
    skillId: "needle-passing",
    sourceType: "internal-recording" as const,
    sourceName: "synthetic",
    coordinateSystem: COORDINATE_SYSTEM,
    fps: 30,
    segments: [{ id: "approach", startMs: 0, endMs: 1000 }],
    frames: [
      { tMs: 0, segmentId: "approach", normalizedProgress: 0, leftTool: tool("left-tool"), rightTool: tool("right-tool") },
      { tMs: 1000, segmentId: "approach", normalizedProgress: 1, leftTool: tool("left-tool"), rightTool: tool("right-tool") },
    ],
  };
}

describe("parseReference", () => {
  it("accepts a well-formed ReferenceMotion", () => {
    const ref = parseReference(validReference());
    expect(ref.id).toBe("needle-passing-reference-v1");
    expect(ref.frames).toHaveLength(2);
  });

  it("rejects a wrong coordinate system", () => {
    const bad = { ...validReference(), coordinateSystem: "raw-dataset" };
    expect(() => parseReference(bad)).toThrow();
  });

  it("rejects a missing required field", () => {
    const bad = validReference() as Record<string, unknown>;
    delete bad.frames;
    expect(() => parseReference(bad)).toThrow();
  });

  it("rejects normalizedProgress outside 0..1", () => {
    const bad = validReference();
    bad.frames[0].normalizedProgress = 1.5;
    expect(() => parseReference(bad)).toThrow();
  });

  it("rejects an unexpected schema version", () => {
    const bad = { ...validReference(), schemaVersion: 999 };
    expect(() => parseReference(bad)).toThrow();
  });
});
