import { CONTROL_TIMING, HAND_SLOTS, WORKSPACE_DIRECTIONS, type HandSlot, type VideoDimensions, type WorkspaceDirection, type WorkspaceProgress } from "./control-types";
import type { HandMeasurement } from "./hand-geometry";

const MINIMUM_TRAVEL = 0.035; // image-height units from neutral
const DIRECTION_HOLD_MS = 120;
interface DirectionCapture { samples: number[]; since: number | null; distance: number | null }
const direction = (): DirectionCapture => ({ samples: [], since: null, distance: null });
const handCapture = () => ({ left: direction(), right: direction(), up: direction(), down: direction() });

/** Independent, sustained direction captures. Invalid observations cannot add
 * credit, but do not erase already confirmed travel from earlier observations.
 */
export class WorkspaceCalibration {
  private captures = { left: handCapture(), right: handCapture() };
  private previous: Record<HandSlot, number | null> = { left: null, right: null };
  private validMs = { left: 0, right: 0 };

  constructor(private readonly neutral: Record<HandSlot, HandMeasurement>, private readonly size: VideoDimensions) {}

  interrupt(slot: HandSlot) {
    this.previous[slot] = null;
    for (const d of WORKSPACE_DIRECTIONS) {
      const capture = this.captures[slot][d];
      if (capture.distance === null) { capture.samples = []; capture.since = null; }
    }
  }

  update(slot: HandSlot, measurement: HandMeasurement | null, tMs: number) {
    if (!measurement) { this.interrupt(slot); return; }
    const previous = this.previous[slot];
    if (previous !== null && tMs <= previous) return;
    if (previous !== null && tMs - previous > CONTROL_TIMING.maxSampleGapMs) this.interrupt(slot);
    if (this.previous[slot] !== null) this.validMs[slot] += tMs - this.previous[slot]!;
    this.previous[slot] = tMs;
    const origin = this.neutral[slot].center;
    const dx = (origin.x - measurement.center.x) * this.size.width / this.size.height;
    const dy = origin.y - measurement.center.y;
    const distances = { left: -dx, right: dx, up: dy, down: -dy };
    for (const d of WORKSPACE_DIRECTIONS) {
      const capture = this.captures[slot][d];
      if (capture.distance !== null) continue;
      const distance = distances[d];
      if (!Number.isFinite(distance) || distance < MINIMUM_TRAVEL) { capture.since = null; capture.samples = []; continue; }
      capture.since ??= tMs;
      capture.samples.push(distance);
      if (capture.samples.length > 16) capture.samples.shift();
      if (tMs - capture.since >= DIRECTION_HOLD_MS && capture.samples.length >= 3) {
        const sorted = [...capture.samples].sort((a, b) => a - b);
        capture.distance = sorted[Math.floor(sorted.length / 2)];
      }
    }
  }

  progress(): WorkspaceProgress {
    const result = {} as WorkspaceProgress;
    for (const slot of HAND_SLOTS) {
      result[slot] = {} as Record<WorkspaceDirection, number>;
      for (const d of WORKSPACE_DIRECTIONS) {
        const capture = this.captures[slot][d];
        result[slot][d] = capture.distance !== null ? 1 : Math.min(0.99, capture.samples.length / 4);
      }
    }
    return result;
  }

  next(): { slot: HandSlot; direction: WorkspaceDirection } | null {
    for (const slot of HAND_SLOTS) for (const d of WORKSPACE_DIRECTIONS) {
      if (this.captures[slot][d].distance === null) return { slot, direction: d };
    }
    return null;
  }

  range(slot: HandSlot) {
    return Object.fromEntries(WORKSPACE_DIRECTIONS.map(d => [d, this.captures[slot][d].distance!])) as Record<WorkspaceDirection, number>;
  }

  ready(minimumValidMs: number) {
    return this.next() === null && HAND_SLOTS.every(slot => this.validMs[slot] >= minimumValidMs);
  }
}
