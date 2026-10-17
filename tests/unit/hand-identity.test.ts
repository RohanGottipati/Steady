import { describe, expect, it } from "vitest";
import { HandIdentityTracker, observations } from "@/lib/vision/hand-identity";
import { previewPoint } from "@/lib/vision/preview-coordinates";
import { detection } from "../fixtures/vision";

describe("raw observations and preview coordinates", () => {
  it("uses stable palm landmarks, copies arrays, and keeps raw image coordinates", () => {
    const result = detection({ label: "Left", x: 0.25 });
    result.landmarks[0][5].x = 0.5;
    const hand = observations(result)[0];
    expect(hand.palmCenter.x).toBe(0.3125);
    result.landmarks[0][0].x = 10;
    expect(hand.landmarks[0].x).toBe(0.25);
    expect(previewPoint(0.25, 0.2, 1000, 500)).toEqual({ x: 750, y: 100 });
  });
  it("rejects invalid landmarks without discarding the other valid hand", () => {
    const result = detection({ label: "Left", x: 0.2 }, { label: "Right", x: 0.8 });
    result.worldLandmarks[0][3].z = NaN;
    expect(observations(result).map(hand => hand.handedness)).toEqual(["Right"]);
    result.landmarks[1].pop();
    expect(observations(result)).toEqual([]);
  });
  it("rejects invalid categories and confidence but accepts finite off-image coordinates", () => {
    expect(observations(detection({ label: "Unknown", x: 0.2 }))).toEqual([]);
    expect(observations(detection({ label: "Left", x: 0.2, score: Infinity }))).toEqual([]);
    expect(observations(detection({ label: "Left", x: -0.02 }))).toHaveLength(1);
  });
});

describe("hand identity", () => {
  it("ignores SDK array ordering and crosses screen sides without swapping slots", () => {
    const tracker = new HandIdentityTracker();
    for (let step = 0; step <= 10; step++) {
      const x = 0.2 + step * 0.06;
      const hands = [{ label: "Left", x }, { label: "Right", x: 1 - x }];
      if (step % 2) hands.reverse();
      const snapshot = tracker.update(detection(...hands), step * 40);
      expect(snapshot.left?.palmCenter.x).toBeCloseTo(x);
      expect(snapshot.right?.palmCenter.x).toBeCloseTo(1 - x);
    }
  });
  it("does not relabel a hand because of one low-confidence contradictory label", () => {
    const tracker = new HandIdentityTracker();
    tracker.update(detection({ label: "Left", x: 0.2 }, { label: "Right", x: 0.8 }), 0);
    const snapshot = tracker.update(detection({ label: "Right", x: 0.21, score: 0.6 }, { label: "Right", x: 0.79 }), 40);
    expect(snapshot.left?.palmCenter.x).toBe(0.21);
    expect(snapshot.left?.handednessConfidence).toBeCloseTo(0.4);
    expect(snapshot.right?.palmCenter.x).toBe(0.79);
  });
  it("emits missing observations during occlusion while reserving short-lived identity history", () => {
    const tracker = new HandIdentityTracker();
    tracker.update(detection({ label: "Left", x: 0.2 }), 0);
    expect(tracker.update(detection(), 100).left).toBeNull();
    expect(tracker.update(detection({ label: "Right", x: 0.21, score: 0.6 }), 200).left?.handedness).toBe("Left");
    expect(tracker.update(detection({ label: "Right", x: 0.22 }), 800).right?.handedness).toBe("Right");
  });
  it("leaves ambiguous duplicate labels unassigned at startup", () => {
    const snapshot = new HandIdentityTracker().update(detection({ label: "Left", x: 0.2 }, { label: "Left", x: 0.8 }), 0);
    expect(snapshot.left).toBeNull();
    expect(snapshot.right).toBeNull();
  });
  it("never publishes stale or nonfinite timestamps and resets between sessions", () => {
    const tracker = new HandIdentityTracker();
    tracker.update(detection({ label: "Left", x: 0.2 }), 100);
    expect(tracker.update(detection({ label: "Left", x: 0.3 }), 99).left).toBeNull();
    expect(tracker.update(detection(), NaN).left).toBeNull();
    tracker.reset();
    expect(tracker.update(detection({ label: "Right", x: 0.2 }), 0).right).not.toBeNull();
  });
});
