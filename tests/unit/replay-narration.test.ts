import { describe, expect, it } from "vitest";
import { markerNarration, planReplayNarration, selectFocusMarker } from "@/lib/simulation/replay-narration";
import type { ReplayMarker } from "@/types";

function marker(overrides: Partial<ReplayMarker> & Pick<ReplayMarker, "tMs" | "segmentId" | "metricId" | "severity">): ReplayMarker {
  return { explanationData: {}, ...overrides };
}

describe("S2 replay narration", () => {
  it("breaks severity ties by earlier time, then metric id, then segment id", () => {
    const later = marker({ tMs: 80, segmentId: "grip", metricId: "pathSimilarity", severity: 0.4 });
    const earlier = marker({ tMs: 15, segmentId: "approach", metricId: "zMetric", severity: 0.4 });
    expect(selectFocusMarker([later, earlier])).toBe(earlier);
    const bMetric = marker({ tMs: 15, segmentId: "approach", metricId: "bMetric", severity: 0.4 });
    const aMetric = marker({ tMs: 15, segmentId: "exit", metricId: "aMetric", severity: 0.4 });
    expect(selectFocusMarker([bMetric, aMetric])?.metricId).toBe("aMetric");
    const zSegment = marker({ tMs: 15, segmentId: "rotation", metricId: "pathSimilarity", severity: 0.4 });
    const aSegment = marker({ tMs: 15, segmentId: "align", metricId: "pathSimilarity", severity: 0.4 });
    expect(selectFocusMarker([zSegment, aSegment])).toBe(aSegment);
    expect(selectFocusMarker([])).toBeNull();
  });

  it("prefers a supplied review sentence and otherwise describes marker evidence", () => {
    const issue = marker({
      tMs: 15, segmentId: "rotation", metricId: "instrumentOrientationAccuracy", severity: 0.42,
      explanationData: { orientationErrorDeg: 12.5 },
    });
    const reviewed = planReplayNarration({
      skillId: "needle-passing", markers: [issue], review: { replayNarration: "  Supplied review.  " },
    });
    expect(reviewed).toMatchObject({ text: "Supplied review.", source: "review", marker: issue });
    const fallback = planReplayNarration({
      skillId: "needle-passing", markers: [issue], review: { replayNarration: "   " },
    });
    expect(fallback.source).toBe("marker");
    expect(fallback.marker).toBe(issue);
    expect(fallback.text).toContain("Needle Passing");
    expect(fallback.text).toContain("Rotation");
    expect(fallback.text).toContain("Instrument Orientation Accuracy (instrumentOrientationAccuracy)");
    expect(fallback.text).toContain("orientation difference 12.5 degrees");
    expect(fallback.text).toContain("Severity 42 out of 100");
    expect(markerNarration(issue, "needle-passing")).toBe(fallback.text);
    expect(planReplayNarration({ skillId: "needle-passing", markers: [] })).toEqual({
      text: null, source: "none", marker: null,
    });
    const other = marker({ tMs: 80, segmentId: "grip", metricId: "pathSimilarity", severity: 0.1, explanationData: { tipErrorUnits: 0.02 } });
    const focused = planReplayNarration({
      skillId: "needle-passing", markers: [issue, other], review: { replayNarration: "Supplied review." }, focus: other,
    });
    expect(focused.source).toBe("marker");
    expect(focused.text).toContain("Path Similarity");
    expect(focused.text).not.toBe("Supplied review.");
  });
});
