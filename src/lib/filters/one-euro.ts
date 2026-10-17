/** Timestamp-based 1€ filter (Casiez, Roussel & Vogel, CHI 2012).
 * https://gery.casiez.net/1euro/ — timestamps here are milliseconds, cutoffs Hz.
 */
export interface FilterOptions { minCutoff: number; beta: number; derivativeCutoff: number }
export const DEFAULT_FILTER: Readonly<FilterOptions> = { minCutoff: 1, beta: 0.5, derivativeCutoff: 1 };

export function smoothingAlpha(cutoff: number, deltaSeconds: number) {
  return 1 / (1 + 1 / (2 * Math.PI * cutoff * deltaSeconds));
}

export class OneEuroFilter {
  private time: number | undefined;
  private raw = 0;
  private value = 0;
  private derivative = 0;
  private readonly options: FilterOptions;

  constructor(options: Partial<FilterOptions> = {}) {
    this.options = { ...DEFAULT_FILTER, ...options };
    const { minCutoff, beta, derivativeCutoff } = this.options;
    if (![minCutoff, beta, derivativeCutoff].every(Number.isFinite) ||
      minCutoff <= 0 || derivativeCutoff <= 0 || beta < 0) throw new Error("Invalid One Euro filter options.");
  }

  reset(value?: number, tMs?: number) {
    this.time = undefined;
    this.derivative = 0;
    if (value !== undefined && tMs !== undefined && Number.isFinite(value) && Number.isFinite(tMs)) {
      this.raw = this.value = value;
      this.time = tMs;
    }
  }

  filter(value: number, tMs: number): number | null {
    if (!Number.isFinite(value) || !Number.isFinite(tMs)) return null;
    if (this.time === undefined) { this.reset(value, tMs); return value; }
    if (tMs <= this.time) return this.value;
    const delta = (tMs - this.time) / 1000;
    const derivativeAlpha = smoothingAlpha(this.options.derivativeCutoff, delta);
    const derivative = this.derivative + derivativeAlpha * ((value - this.raw) / delta - this.derivative);
    const alpha = smoothingAlpha(this.options.minCutoff + this.options.beta * Math.abs(derivative), delta);
    const filtered = this.value + alpha * (value - this.value);
    if (!Number.isFinite(derivative) || !Number.isFinite(filtered)) return null;
    this.derivative = derivative;
    this.value = filtered;
    this.raw = value;
    this.time = tMs;
    return this.value;
  }
}
