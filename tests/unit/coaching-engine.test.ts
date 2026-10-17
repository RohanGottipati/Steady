import { describe, expect, it } from "vitest";
import {
  COACHING_MESSAGES,
  CoachingEngine,
  DEFAULT_COACHING_CONFIG,
  coachingMessageFor,
  type CoachingSignals,
} from "@/lib/coaching/coaching-engine";
import { coachingEventSchema, type CoachingEventType } from "@/types/coaching";

// A calm tick: every rule quiet, active attempt, full coaching. Override per test.
function calm(overrides: Partial<CoachingSignals> = {}): CoachingSignals {
  return {
    tMs: 0,
    active: true,
    segmentId: "align",
    voiceCoachingLevel: "full",
    corridorDeviation: 0,
    inCorridor: true,
    orientationErrorDeg: 0,
    inDangerZone: false,
    toolSpeed: 0,
    assistingHandSpeed: 0,
    gripSlipping: false,
    rotationBehindDeg: 0,
    overshoot: false,
    ...overrides,
  };
}

// Deviation far beyond tolerance => severity 1 (above the 0.65 minimum).
const BIG_DEVIATION = DEFAULT_COACHING_CONFIG.thresholds.corridorToleranceUnits + 1;

describe("CoachingEngine rule detection", () => {
  it("generates one path_deviation event for a sustained large deviation", () => {
    const engine = new CoachingEngine();
    // Fires at t=0 (pending), then persists past the commit delay.
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    const tick = engine.evaluate(
      calm({ tMs: DEFAULT_COACHING_CONFIG.commitDelayMs, corridorDeviation: BIG_DEVIATION }),
    );

    expect(tick.recorded.map((e) => e.type)).toEqual(["path_deviation"]);
    expect(engine.events).toHaveLength(1);
    expect(tick.spoken?.text).toBe(COACHING_MESSAGES.path_deviation);
  });

  it("fires danger_zone_near at high severity immediately once committed", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, inDangerZone: true }));
    const tick = engine.evaluate(calm({ tMs: 600, inDangerZone: true }));
    expect(tick.recorded).toHaveLength(1);
    expect(tick.recorded[0].type).toBe("danger_zone_near");
    expect(tick.recorded[0].severity).toBeGreaterThanOrEqual(0.8);
  });

  it("fires rotation_late only in the rotation segment", () => {
    const behind = { rotationBehindDeg: 50 }; // severity (50-20)/40 = 0.75, above minimum
    const inAlign = new CoachingEngine();
    inAlign.evaluate(calm({ tMs: 0, segmentId: "align", ...behind }));
    inAlign.evaluate(calm({ tMs: 600, segmentId: "align", ...behind }));
    expect(inAlign.events).toHaveLength(0);

    const inRotation = new CoachingEngine();
    inRotation.evaluate(calm({ tMs: 0, segmentId: "rotation", ...behind }));
    inRotation.evaluate(calm({ tMs: 600, segmentId: "rotation", ...behind }));
    expect(inRotation.events.map((e) => e.type)).toEqual(["rotation_late"]);
  });

  it("every recorded event validates against the shared CoachingEvent schema", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events.length).toBeGreaterThan(0);
    for (const event of engine.events) {
      expect(() => coachingEventSchema.parse(event)).not.toThrow();
    }
  });
});

describe("CoachingEngine suppression and cooldown", () => {
  it("does not spam while a deviation persists continuously", () => {
    const engine = new CoachingEngine();
    for (let t = 0; t <= 10_000; t += 400) {
      engine.evaluate(calm({ tMs: t, corridorDeviation: BIG_DEVIATION }));
    }
    expect(engine.events).toHaveLength(1);
    expect(engine.spokenCount).toBe(1);
  });

  it("suppresses a repeat of the same event type within the suppression window", () => {
    const engine = new CoachingEngine();
    // First incident: fire, commit, then clear.
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 800, corridorDeviation: 0 })); // cleared
    // Re-fires well within the 8s suppression window => suppressed.
    engine.evaluate(calm({ tMs: 1000, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 1600, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events).toHaveLength(1);
  });

  it("allows the same event type again after the suppression window", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 800, corridorDeviation: 0 })); // cleared
    const after = DEFAULT_COACHING_CONFIG.sameEventRepeatSuppressionMs + 1000;
    engine.evaluate(calm({ tMs: after, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: after + 600, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events).toHaveLength(2);
  });

  it("enforces the spoken cooldown while still recording events", () => {
    const engine = new CoachingEngine();
    // path_deviation commits at t=600 and is spoken.
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    const first = engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    // danger_zone_near commits ~700ms later, inside the 4s cooldown.
    engine.evaluate(calm({ tMs: 700, corridorDeviation: BIG_DEVIATION, inDangerZone: true }));
    const second = engine.evaluate(
      calm({ tMs: 1300, corridorDeviation: BIG_DEVIATION, inDangerZone: true }),
    );
    expect(first.spoken?.event.type).toBe("path_deviation");
    expect(second.recorded.map((e) => e.type)).toEqual(["danger_zone_near"]);
    expect(second.spoken).toBeNull();
    expect(engine.events).toHaveLength(2);
  });

  it("caps the number of spoken messages per attempt", () => {
    const engine = new CoachingEngine();
    const types: Array<[CoachingEventType, Partial<CoachingSignals>]> = [
      ["path_deviation", { corridorDeviation: BIG_DEVIATION }],
      ["danger_zone_near", { inDangerZone: true }],
      ["moving_too_fast", { toolSpeed: 100 }],
      ["unstable_grip", { gripSlipping: true }],
      ["left_hand_unstable", { assistingHandSpeed: 100 }],
    ];
    // Space each incident 6s apart so neither cooldown nor suppression blocks speaking.
    types.forEach(([, signal], i) => {
      const base = i * 6000;
      engine.evaluate(calm({ tMs: base, ...signal }));
      engine.evaluate(calm({ tMs: base + 600, ...signal }));
      engine.evaluate(calm({ tMs: base + 800 })); // clear before the next incident
    });
    expect(engine.events).toHaveLength(5);
    expect(engine.spokenCount).toBe(DEFAULT_COACHING_CONFIG.maxSpoken);
  });
});

describe("CoachingEngine cancellation", () => {
  it("cancels a queued message when the issue is corrected before it commits", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION })); // pending
    const tick = engine.evaluate(calm({ tMs: 200, corridorDeviation: 0 })); // corrected early
    expect(tick.canceledPending).toBe(true);
    expect(engine.events).toHaveLength(0);
    expect(engine.spokenCount).toBe(0);
  });
});

describe("CoachingEngine severity and mode gating", () => {
  it("ignores deviations whose severity is below the minimum", () => {
    const engine = new CoachingEngine();
    // Just barely over tolerance => severity well under 0.65.
    const tiny = DEFAULT_COACHING_CONFIG.thresholds.corridorToleranceUnits + 0.001;
    engine.evaluate(calm({ tMs: 0, corridorDeviation: tiny }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: tiny }));
    expect(engine.events).toHaveLength(0);
  });

  it("high-severity level drops a medium-severity event that full would keep", () => {
    // Choose a deviation whose severity sits between minimum (0.65) and high (0.8).
    const { thresholds, minimumSeverity, highSeverityThreshold } = DEFAULT_COACHING_CONFIG;
    const target = (minimumSeverity + highSeverityThreshold) / 2;
    const medium = thresholds.corridorToleranceUnits + target * thresholds.corridorSeverityRangeUnits;

    const full = new CoachingEngine();
    full.evaluate(calm({ tMs: 0, corridorDeviation: medium }));
    full.evaluate(calm({ tMs: 600, corridorDeviation: medium }));
    expect(full.events).toHaveLength(1);

    const high = new CoachingEngine();
    high.evaluate(calm({ tMs: 0, voiceCoachingLevel: "high-severity", corridorDeviation: medium }));
    high.evaluate(calm({ tMs: 600, voiceCoachingLevel: "high-severity", corridorDeviation: medium }));
    expect(high.events).toHaveLength(0);
  });

  it("produces no coaching when the voice level is none", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, voiceCoachingLevel: "none", corridorDeviation: BIG_DEVIATION, inDangerZone: true }));
    const tick = engine.evaluate(
      calm({ tMs: 600, voiceCoachingLevel: "none", corridorDeviation: BIG_DEVIATION, inDangerZone: true }),
    );
    expect(engine.events).toHaveLength(0);
    expect(tick.spoken).toBeNull();
  });

  it("produces no coaching outside an active attempt", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, active: false, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, active: false, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events).toHaveLength(0);
  });
});

describe("coaching message selection", () => {
  it("maps every coaching event type to a non-empty message", () => {
    const types: CoachingEventType[] = [
      "path_deviation",
      "rotation_late",
      "moving_too_fast",
      "unstable_grip",
      "left_hand_unstable",
      "danger_zone_near",
      "overshoot",
    ];
    for (const type of types) {
      expect(coachingMessageFor(type).length).toBeGreaterThan(0);
      expect(COACHING_MESSAGES[type]).toBe(coachingMessageFor(type));
    }
  });
});

describe("CoachingEngine reset", () => {
  it("clears recorded events and spoken count", () => {
    const engine = new CoachingEngine();
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events).toHaveLength(1);
    engine.reset();
    expect(engine.events).toHaveLength(0);
    expect(engine.spokenCount).toBe(0);
    // A fresh incident fires cleanly after reset.
    engine.evaluate(calm({ tMs: 0, corridorDeviation: BIG_DEVIATION }));
    engine.evaluate(calm({ tMs: 600, corridorDeviation: BIG_DEVIATION }));
    expect(engine.events).toHaveLength(1);
  });
});
