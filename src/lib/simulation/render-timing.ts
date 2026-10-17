/** Bounded numerical diagnostics only; no images, landmarks, or persistent data. */
export class RenderTiming {
  private samples: { tMs: number; deltaMs: number }[] = [];
  private lastMs: number | null = null;
  clear() { this.samples = []; this.lastMs = null; }
  record(nowMs: number) {
    if (!Number.isFinite(nowMs) || (this.lastMs !== null && nowMs <= this.lastMs)) return;
    if (this.lastMs !== null) this.samples.push({ tMs: nowMs, deltaMs: nowMs - this.lastMs });
    this.lastMs = nowMs;
    while (this.samples.length && (this.samples[0].tMs < nowMs - 120_000 || this.samples.length > 20_000)) this.samples.shift();
  }
  read() {
    const values = this.samples.map(sample => sample.deltaMs).sort((a, b) => a - b);
    if (!values.length) return { medianFps: 0, p95FrameMs: 0, sampleCount: 0 };
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    return { medianFps: 1000 / median, p95FrameMs: values[Math.ceil(values.length * 0.95) - 1], sampleCount: values.length };
  }
}
