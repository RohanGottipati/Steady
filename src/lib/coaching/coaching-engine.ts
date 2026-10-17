import {
  COACHING_MESSAGE_POLICY,
  type CoachingEvent,
  type CoachingEventType,
} from "@/types/coaching";

/**
 * B6 - Live coaching event engine.
 *
 * Deterministic, lightweight rules (plan §14) evaluated every ~300-500 ms while a
 * user performs an attempt. Each tick accepts a compact {@link CoachingSignals}
 * snapshot derived from the live exercise/control state and produces at most one
 * spoken message, obeying the shared {@link COACHING_MESSAGE_POLICY}:
 *
 * - threshold rules turn telemetry into candidate events with a 0-1 severity,
 * - a short commit delay lets a self-corrected issue cancel its queued message,
 * - repeat suppression keeps a sustained issue from producing a storm of events,
 * - a global cooldown and per-attempt cap bound how many are actually spoken,
 * - every committed event is recorded for post-attempt review/upload.
 *
 * The engine never computes scores; it only flags live deviations. Authoritative
 * scoring stays in the deterministic evaluator (B3/B5).
 */

export type VoiceCoachingLevel = "full" | "high-severity" | "none";

/** Compact per-tick telemetry the rules read. Decoupled from the exercise snapshot
 * so the engine stays testable and the live loop (S1) can assemble it cheaply. */
export interface CoachingSignals {
  /** Attempt time in ms; must be non-decreasing across ticks. */
  tMs: number;
  /** Whether the attempt is actively being performed (no coaching otherwise). */
  active: boolean;
  segmentId: string;
  voiceCoachingLevel: VoiceCoachingLevel;
  /** Distance of the controlling point off the curved corridor, scene units. */
  corridorDeviation: number;
  /** True only during corridor segments with the needle held (deviation meaningful). */
  inCorridor: boolean;
  orientationErrorDeg: number;
  inDangerZone: boolean;
  /** Controlling tool-tip speed, scene units/sec. */
  toolSpeed: number;
  /** Non-dominant (assisting) hand speed, scene units/sec. */
  assistingHandSpeed: number;
  /** Grip loosened while the needle is expected to stay held. */
  gripSlipping: boolean;
  /** In the rotation segment: required minus achieved rotation, deg (>0 = behind). */
  rotationBehindDeg: number;
  /** Controlling tip crossed a target then reversed (overshoot correction). */
  overshoot: boolean;
}

export interface CoachingThresholds {
  corridorToleranceUnits: number;
  corridorSeverityRangeUnits: number;
  dangerZoneSeverity: number;
  speedLimitUnitsPerSec: number;
  speedSeverityRangeUnitsPerSec: number;
  gripSeverity: number;
  assistIdleLimitUnitsPerSec: number;
  assistSeverityRangeUnitsPerSec: number;
  rotationBehindToleranceDeg: number;
  rotationSeverityRangeDeg: number;
  overshootSeverity: number;
}

export interface CoachingEngineConfig {
  minimumSeverity: number;
  highSeverityThreshold: number;
  cooldownMs: number;
  sameEventRepeatSuppressionMs: number;
  maxSpoken: number;
  commitDelayMs: number;
  thresholds: CoachingThresholds;
}

/** Default message policy (plan §14.2) plus deterministic rule thresholds. The
 * corridor tolerance mirrors the exercise engine's corridor so a "deviation" means
 * the user left the allowed path. All values are tunable simulator defaults. */
export const DEFAULT_COACHING_CONFIG: CoachingEngineConfig = {
  minimumSeverity: COACHING_MESSAGE_POLICY.minimumSeverity,
  highSeverityThreshold: 0.8,
  cooldownMs: COACHING_MESSAGE_POLICY.cooldownMs,
  sameEventRepeatSuppressionMs: COACHING_MESSAGE_POLICY.sameEventRepeatSuppressionMs,
  maxSpoken: COACHING_MESSAGE_POLICY.maxLiveSpokenMessagesPerAttempt,
  commitDelayMs: 500,
  thresholds: {
    corridorToleranceUnits: 0.12,
    corridorSeverityRangeUnits: 0.25,
    dangerZoneSeverity: 0.9,
    speedLimitUnitsPerSec: 2.5,
    speedSeverityRangeUnitsPerSec: 2.0,
    gripSeverity: 0.85,
    assistIdleLimitUnitsPerSec: 1.5,
    assistSeverityRangeUnitsPerSec: 1.5,
    rotationBehindToleranceDeg: 20,
    rotationSeverityRangeDeg: 40,
    overshootSeverity: 0.75,
  },
};

/** Pre-generated coaching clips (plan §14.3). Keep phrasing stable; these strings
 * key the local ElevenLabs audio assets generated in B7. */
export const COACHING_MESSAGES: Record<CoachingEventType, string> = {
  path_deviation: "Return toward the highlighted path.",
  rotation_late: "Begin rotating earlier.",
  moving_too_fast: "Slow down as you approach the target.",
  unstable_grip: "Keep your grip consistent.",
  left_hand_unstable: "Keep your assisting hand steady.",
  danger_zone_near: "Ease away from the tissue wall.",
  overshoot: "You moved past the target — correct gently.",
};

export function coachingMessageFor(type: CoachingEventType): string {
  return COACHING_MESSAGES[type];
}

export interface SpokenCoachingMessage {
  event: CoachingEvent;
  text: string;
}

export interface CoachingTick {
  /** Events committed on this tick (recorded for the attempt). */
  recorded: CoachingEvent[];
  /** The single message spoken on this tick, if the policy allowed audio. */
  spoken: SpokenCoachingMessage | null;
  /** A pending (queued, not-yet-spoken) incident was canceled by self-correction. */
  canceledPending: boolean;
}

type EventData = Record<string, number | string | boolean>;
type Candidate = { severity: number; data: EventData };

interface Incident {
  firstFiredMs: number;
  maxSeverity: number;
  data: EventData;
  committed: boolean;
  committedMs: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

const COACHING_EVENT_TYPES: CoachingEventType[] = [
  "path_deviation",
  "danger_zone_near",
  "moving_too_fast",
  "unstable_grip",
  "left_hand_unstable",
  "rotation_late",
  "overshoot",
];

export class CoachingEngine {
  readonly config: CoachingEngineConfig;
  readonly events: CoachingEvent[] = [];
  spokenCount = 0;

  private incidents = new Map<CoachingEventType, Incident>();
  private lastCommittedMs = new Map<CoachingEventType, number>();
  private lastSpokenMs: number | null = null;
  private seq = 0;

  constructor(config: CoachingEngineConfig = DEFAULT_COACHING_CONFIG) {
    this.config = config;
  }

  reset() {
    this.events.length = 0;
    this.spokenCount = 0;
    this.incidents.clear();
    this.lastCommittedMs.clear();
    this.lastSpokenMs = null;
    this.seq = 0;
  }

  evaluate(signals: CoachingSignals): CoachingTick {
    const recorded: CoachingEvent[] = [];
    let canceledPending = false;

    const threshold = this.severityThreshold(signals.voiceCoachingLevel);
    // When coaching is off or the attempt is idle, no rule is eligible; any pending
    // incident is dropped silently (it was never spoken, so nothing to cancel).
    const candidates =
      signals.active && Number.isFinite(threshold) ? this.evaluateRules(signals) : {};

    const committedThisTick: CoachingEvent[] = [];

    for (const type of COACHING_EVENT_TYPES) {
      const candidate = candidates[type];
      const eligible = candidate !== undefined && candidate.severity >= threshold;
      const incident = this.incidents.get(type);

      if (eligible) {
        if (incident) {
          incident.maxSeverity = Math.max(incident.maxSeverity, candidate.severity);
          if (candidate.severity >= incident.maxSeverity) incident.data = candidate.data;
          if (!incident.committed && signals.tMs - incident.firstFiredMs >= this.config.commitDelayMs) {
            incident.committed = true;
            incident.committedMs = signals.tMs;
            const event = this.makeEvent(type, signals, incident);
            this.events.push(event);
            recorded.push(event);
            committedThisTick.push(event);
          }
        } else {
          const last = this.lastCommittedMs.get(type);
          const suppressed =
            last !== undefined && signals.tMs - last < this.config.sameEventRepeatSuppressionMs;
          if (!suppressed) {
            this.incidents.set(type, {
              firstFiredMs: signals.tMs,
              maxSeverity: candidate.severity,
              data: candidate.data,
              committed: false,
              committedMs: 0,
            });
          }
        }
      } else if (incident) {
        // Rule stopped firing: a committed incident ends and arms repeat suppression;
        // a still-pending incident was corrected before its message could be spoken.
        if (incident.committed) {
          this.lastCommittedMs.set(type, incident.committedMs);
        } else {
          canceledPending = true;
        }
        this.incidents.delete(type);
      }
    }

    const spoken = this.speak(committedThisTick, signals.tMs);
    return { recorded, spoken, canceledPending };
  }

  /** Choose at most one message to speak this tick: the highest-severity committed
   * event, subject to the global cooldown and the per-attempt spoken cap. */
  private speak(committed: CoachingEvent[], tMs: number): SpokenCoachingMessage | null {
    if (committed.length === 0 || this.spokenCount >= this.config.maxSpoken) return null;
    if (this.lastSpokenMs !== null && tMs - this.lastSpokenMs < this.config.cooldownMs) return null;

    const event = [...committed].sort((a, b) => b.severity - a.severity)[0];
    this.spokenCount += 1;
    this.lastSpokenMs = tMs;
    return { event, text: coachingMessageFor(event.type) };
  }

  private makeEvent(type: CoachingEventType, signals: CoachingSignals, incident: Incident): CoachingEvent {
    this.seq += 1;
    return {
      id: `coach-${this.seq}-${type}`,
      tMs: Math.max(0, signals.tMs),
      type,
      severity: clamp01(incident.maxSeverity),
      segmentId: signals.segmentId,
      data: incident.data,
    };
  }

  private severityThreshold(level: VoiceCoachingLevel): number {
    if (level === "none") return Number.POSITIVE_INFINITY;
    if (level === "high-severity") return this.config.highSeverityThreshold;
    return this.config.minimumSeverity;
  }

  private evaluateRules(s: CoachingSignals): Partial<Record<CoachingEventType, Candidate>> {
    const t = this.config.thresholds;
    const out: Partial<Record<CoachingEventType, Candidate>> = {};

    if (s.inCorridor && s.corridorDeviation > t.corridorToleranceUnits) {
      const over = s.corridorDeviation - t.corridorToleranceUnits;
      out.path_deviation = {
        severity: clamp01(over / t.corridorSeverityRangeUnits),
        data: { deviation: round3(s.corridorDeviation), tolerance: t.corridorToleranceUnits },
      };
    }

    if (s.inDangerZone) {
      out.danger_zone_near = { severity: t.dangerZoneSeverity, data: { inDangerZone: true } };
    }

    if (s.toolSpeed > t.speedLimitUnitsPerSec) {
      const over = s.toolSpeed - t.speedLimitUnitsPerSec;
      out.moving_too_fast = {
        severity: clamp01(over / t.speedSeverityRangeUnitsPerSec),
        data: { speed: round3(s.toolSpeed), limit: t.speedLimitUnitsPerSec },
      };
    }

    if (s.gripSlipping) {
      out.unstable_grip = { severity: t.gripSeverity, data: { gripSlipping: true } };
    }

    if (s.assistingHandSpeed > t.assistIdleLimitUnitsPerSec) {
      const over = s.assistingHandSpeed - t.assistIdleLimitUnitsPerSec;
      out.left_hand_unstable = {
        severity: clamp01(over / t.assistSeverityRangeUnitsPerSec),
        data: { speed: round3(s.assistingHandSpeed) },
      };
    }

    if (s.segmentId === "rotation" && s.rotationBehindDeg > t.rotationBehindToleranceDeg) {
      const over = s.rotationBehindDeg - t.rotationBehindToleranceDeg;
      out.rotation_late = {
        severity: clamp01(over / t.rotationSeverityRangeDeg),
        data: { behindDeg: round3(s.rotationBehindDeg) },
      };
    }

    if (s.overshoot) {
      out.overshoot = { severity: t.overshootSeverity, data: { overshoot: true } };
    }

    return out;
  }
}
