import type { DetectionResult } from "@/lib/vision/types";

export function detection(...hands: { label: string; x: number; y?: number; score?: number }[]): DetectionResult {
  return {
    landmarks: hands.map(hand => Array.from({ length: 21 }, () => ({ x: hand.x, y: hand.y ?? 0.5, z: 0 }))),
    worldLandmarks: hands.map(() => Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))),
    handedness: hands.map(hand => [{ categoryName: hand.label, score: hand.score ?? 0.99 }]),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
