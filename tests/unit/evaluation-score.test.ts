import { describe, expect, it } from "vitest";
import { pathLength, quatAngleDeg, tipDistance } from "@/lib/evaluation/score";
import { errorToScore } from "@/lib/evaluation/score";

describe("errorToScore", () => {
  it("is 100 at zero error and 0 at/above tolerance", () => {
    expect(errorToScore(0, 1)).toBe(100);
    expect(errorToScore(1, 1)).toBe(0);
    expect(errorToScore(2, 1)).toBe(0);
  });

  it("is monotonic decreasing between 0 and tolerance", () => {
    expect(errorToScore(0.25, 1)).toBe(75);
    expect(errorToScore(0.5, 1)).toBe(50);
    expect(errorToScore(0.25, 1)).toBeGreaterThan(errorToScore(0.5, 1));
  });
});

describe("tipDistance", () => {
  it("computes euclidean distance", () => {
    expect(tipDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 9);
  });
});

describe("quatAngleDeg", () => {
  it("is 0 for identical orientations", () => {
    expect(quatAngleDeg({ x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0, 6);
  });

  it("measures a 90-degree rotation about Z", () => {
    const h = Math.SQRT1_2; // sin/cos of 45deg
    const q90 = { x: 0, y: 0, z: h, w: h };
    expect(quatAngleDeg({ x: 0, y: 0, z: 0, w: 1 }, q90)).toBeCloseTo(90, 4);
  });

  it("ignores double-cover sign (q and -q are the same rotation)", () => {
    const q = { x: 0, y: 0, z: 0, w: 1 };
    const negq = { x: 0, y: 0, z: 0, w: -1 };
    expect(quatAngleDeg(q, negq)).toBeCloseTo(0, 6);
  });
});

describe("pathLength", () => {
  it("sums segment distances along a polyline", () => {
    expect(
      pathLength([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
      ]),
    ).toBeCloseTo(2, 9);
  });
});
