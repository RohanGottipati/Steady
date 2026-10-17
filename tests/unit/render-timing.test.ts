import { expect, it } from "vitest";
import { RenderTiming } from "@/lib/simulation/render-timing";

it("measures frame intervals including stalls without counting duplicate/invalid timestamps", () => {
  const timing = new RenderTiming();
  expect(timing.read().sampleCount).toBe(0);
  for (const time of [0, 10, 20, 30, 40, 140, 140, NaN, 100]) timing.record(time);
  expect(timing.read()).toEqual({ medianFps: 100, p95FrameMs: 100, sampleCount: 5 });
  timing.clear(); timing.record(1000); timing.record(1020);
  expect(timing.read()).toEqual({ medianFps: 50, p95FrameMs: 20, sampleCount: 1 });
});

it("bounds the rolling window and excludes samples older than two minutes", () => {
  const timing = new RenderTiming();
  for (let time = 0; time <= 130_000; time += 10) timing.record(time);
  expect(timing.read()).toEqual({ medianFps: 100, p95FrameMs: 10, sampleCount: 12001 });
  const fast = new RenderTiming(); for (let time = 0; time <= 30_000; time++) fast.record(time);
  expect(fast.read().sampleCount).toBe(20000);
});
