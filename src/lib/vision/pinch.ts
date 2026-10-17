import { CONTROL_TIMING } from "./control-types";

/** Missing frames interrupt evidence; they never synthesize a release. */
export class PinchHysteresis {
  private candidate: { closed: boolean; since: number } | null = null;
  private lastTime: number | null = null;
  constructor(public closed = false) {}
  interrupt() { this.candidate = null; this.lastTime = null; }
  update(ratio: number, tMs: number, enter: number, release: number) {
    if (![ratio, tMs, enter, release].every(Number.isFinite) || enter >= release || ratio < 0) {
      this.interrupt(); return this.closed;
    }
    if (this.lastTime !== null && tMs <= this.lastTime) return this.closed;
    if (this.lastTime !== null && tMs - this.lastTime > CONTROL_TIMING.maxSampleGapMs) this.candidate = null;
    this.lastTime = tMs;
    const desired = this.closed ? !(ratio > release) : ratio < enter;
    if (desired === this.closed) this.candidate = null;
    else if (this.candidate?.closed !== desired) this.candidate = { closed: desired, since: tMs };
    else if (tMs - this.candidate.since >= CONTROL_TIMING.pinchDebounceMs) { this.closed = desired; this.candidate = null; }
    return this.closed;
  }
}
