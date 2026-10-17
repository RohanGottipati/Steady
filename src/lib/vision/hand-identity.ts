import type { Handedness, Vec3 } from "@/types";
import { emptySnapshot, type DetectionResult, type RawTrackedHand, type TrackingSnapshot } from "./types";

const LOCK_MS = 500;
const STRONG_LABEL = 0.9;
const CONTRADICTION_COST = 0.12;
const MAX_MOVEMENT_SQUARED = 0.25;
const AMBIGUITY_MARGIN = 0.005;
const labels: Handedness[] = ["Left", "Right"];
const distanceSquared = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const validPoints = (points: Vec3[] | undefined): points is Vec3[] =>
  !!points && points.length === 21 && points.every(p => p && [p.x, p.y, p.z].every(Number.isFinite));

export function observations(result: DetectionResult): RawTrackedHand[] {
  const hands: RawTrackedHand[] = [];
  for (let i = 0; i < Math.min(2, result.landmarks.length); i++) {
    const points = result.landmarks[i];
    const world = result.worldLandmarks[i];
    const category = result.handedness[i]?.[0];
    if (!validPoints(points) || !validPoints(world) || !category ||
      !labels.includes(category.categoryName as Handedness) ||
      !Number.isFinite(category.score) || category.score < 0.5 || category.score > 1) continue;
    const palmCenter = { x: 0, y: 0, z: 0 };
    for (const index of [0, 5, 9, 17]) {
      palmCenter.x += points[index].x / 4;
      palmCenter.y += points[index].y / 4;
      palmCenter.z += points[index].z / 4;
    }
    hands.push({
      handedness: category.categoryName as Handedness,
      handednessConfidence: category.score,
      landmarks: points.map(p => ({ ...p })),
      worldLandmarks: world.map(p => ({ ...p })),
      palmCenter,
    });
  }
  return hands;
}

/** Global two-slot matching; array order and screen-side never define identity. */
export class HandIdentityTracker {
  private history = new Map<Handedness, { center: Vec3; tMs: number }>();
  private lastTimestamp = -Infinity;

  reset() { this.history.clear(); this.lastTimestamp = -Infinity; }

  update(result: DetectionResult, tMs: number): TrackingSnapshot {
    if (!Number.isFinite(tMs) || tMs <= this.lastTimestamp) return emptySnapshot(tMs);
    this.lastTimestamp = tMs;
    for (const [label, previous] of this.history) {
      if (tMs - previous.tMs > LOCK_MS) this.history.delete(label);
    }
    const hands = observations(result);
    const cost = (hand: RawTrackedHand, label: Handedness) => {
      const previous = this.history.get(label);
      // Opening a fresh slot must not steal a nearby recently observed hand.
      const movement = previous ? distanceSquared(previous.center, hand.palmCenter) : 0.2;
      if (previous && movement > MAX_MOVEMENT_SQUARED) return Infinity;
      if (!previous && hand.handedness !== label) return Infinity;
      return movement + (hand.handedness !== label
        ? CONTRADICTION_COST * (hand.handednessConfidence >= STRONG_LABEL ? 1 : 0.25) : 0);
    };
    const candidates: { indices: [number, number]; count: number; cost: number }[] = [];
    for (let left = -1; left < hands.length; left++) {
      for (let right = -1; right < hands.length; right++) {
        if (left >= 0 && left === right) continue;
        const total = (left < 0 ? 0 : cost(hands[left], "Left")) +
          (right < 0 ? 0 : cost(hands[right], "Right"));
        if (Number.isFinite(total)) candidates.push({ indices: [left, right], count: Number(left >= 0) + Number(right >= 0), cost: total });
      }
    }
    candidates.sort((a, b) => b.count - a.count || a.cost - b.cost);
    const best = candidates[0];
    const runnerUp = candidates[1];
    const ambiguous = runnerUp && best.count === runnerUp.count &&
      Math.abs(best.cost - runnerUp.cost) < AMBIGUITY_MARGIN;
    const snapshot = emptySnapshot(tMs);
    labels.forEach((label, index) => {
      const handIndex = best.indices[index];
      if (handIndex < 0 || (ambiguous && runnerUp.indices[index] !== handIndex)) return;
      const observed = hands[handIndex];
      const hand = {
        ...observed,
        handedness: label,
        handednessConfidence: observed.handedness === label
          ? observed.handednessConfidence : 1 - observed.handednessConfidence,
      };
      this.history.set(label, { center: hand.palmCenter, tMs });
      snapshot[label === "Left" ? "left" : "right"] = hand;
    });
    return snapshot;
  }
}
