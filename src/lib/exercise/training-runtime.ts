import { CoachingEngine, DEFAULT_COACHING_CONFIG } from "@/lib/coaching/coaching-engine";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import { saveCompletedAttempt, type CachePersistence } from "@/lib/storage/attempt-cache";
import { emptyControlSnapshot, type ControlSnapshot } from "@/lib/vision/control-types";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { SkillDefinition, TrainingMode } from "@/types";
import { evaluateCompletedAttempt, type CompletedAttemptBundle } from "./attempt-evaluator";
import { CoachingSignalsAdapter } from "./coaching-signals";
import { ExerciseController } from "./exercise-controller";
import { buildFixtureControlFrames, type FixtureId } from "./fixture-playback";
import { GhostPlaybackController } from "./ghost-playback";
import { DEFAULT_NEEDLE_PASSING_REFERENCE } from "./ghost-reference";
import { EXERCISE_THRESHOLDS } from "./needle-passing-config";

const STEP_MS = 1000 / 30;
export class TrainingRuntime {
  readonly simulation = new ToolSimulationController();
  readonly exercise: ExerciseController;
  readonly ghost = new GhostPlaybackController();
  readonly coaching = new CoachingEngine({
    ...DEFAULT_COACHING_CONFIG,
    thresholds: { ...DEFAULT_COACHING_CONFIG.thresholds, rotationBehindToleranceDeg: 3, rotationSeverityRangeDeg: 12 },
  });
  private readonly signals = new CoachingSignalsAdapter();
  controls: ControlSnapshot = emptyControlSnapshot();
  bundle: CompletedAttemptBundle | null = null;
  error: string | null = null;
  message: string | null = null;
  saveStatus: "idle" | "saving" | "demo" | CachePersistence = "idle";
  generation = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getGeneration = () => this.generation;
  fixtureId: FixtureId | null = null;
  private fixtureFrames: ControlSnapshot[] = [];
  private cursor = 0;
  private accumulator = 0;
  private fixtureClock = 0;
  private fixtureInterrupted = false;
  private lastSource: number | null = null;
  private lastCoachingMs = -Infinity;
  private messageUntilMs = 0;
  private attemptId: string | null = null;
  private reference = structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE);
  private singleHand = false;
  private assisted = true;

  constructor(readonly skill: SkillDefinition = needlePassingSkill, mode: TrainingMode = "learn") {
    this.exercise = new ExerciseController({ skill, mode });
  }

  reset(newSource = false) {
    this.generation++;
    this.simulation.reset(!newSource);
    this.exercise.reset(!newSource);
    this.ghost.reset();
    this.coaching.reset();
    this.signals.reset();
    this.bundle = null; this.error = null; this.message = null; this.saveStatus = "idle";
    this.attemptId = null; this.lastSource = null; this.lastCoachingMs = -Infinity; this.messageUntilMs = 0;
    this.reference = structuredClone(DEFAULT_NEEDLE_PASSING_REFERENCE);
    this.cursor = 0; this.accumulator = 0; this.fixtureInterrupted = false;
    this.controls = emptyControlSnapshot();
    this.fixtureFrames = this.fixtureId ? buildFixtureControlFrames(this.fixtureId) : [];
    this.listeners.forEach(listener => listener());
  }
  configure(mode: TrainingMode, fixtureId: FixtureId | null, singleHand: boolean, assisted: boolean) {
    // Demo recordings are authored for assisted pickup; retain the webcam
    // preference without applying it to synthetic demonstrations.
    assisted = fixtureId ? true : assisted;
    const newSource = this.fixtureId !== fixtureId;
    const changed = newSource || this.exercise.snapshot.mode !== mode || this.singleHand !== singleHand || this.assisted !== assisted;
    if (!changed) return;
    this.fixtureId = fixtureId; this.singleHand = singleHand; this.assisted = assisted;
    this.simulation.setSingleHand(singleHand);
    this.simulation.setAssisted(assisted);
    this.exercise.setMode(mode);
    this.reset(newSource);
  }
  invalidateCalibration() {
    if (!this.fixtureId && !this.bundle && (this.exercise.snapshot.phase !== "idle" || this.simulation.snapshot.left)) this.reset();
  }
  suspend(reason = "Simulation paused until controls are tracking.") {
    if (this.fixtureId && this.controls.calibrated) this.fixtureInterrupted = true;
    this.simulation.suspend(reason);
    this.exercise.suspend(reason);
    this.ghost.suspend();
    this.signals.reset();
    this.message = null;
    this.accumulator = 0;
    this.coaching.evaluate({ tMs: this.exercise.snapshot.elapsedActiveMs, active: false, segmentId: this.exercise.snapshot.segmentId,
      voiceCoachingLevel: this.exercise.snapshot.modeHooks.voiceCoachingLevel, corridorDeviation: 0, inCorridor: false,
      inDangerZone: false, toolSpeed: 0, assistingHandSpeed: 0, gripSlipping: false, rotationBehindDeg: 0, overshoot: false });
  }
  advance(liveControls: ControlSnapshot, deltaSeconds: number, nowMs: number) {
    if (this.bundle || this.error) return;
    if (this.fixtureId) {
      this.accumulator += Number.isFinite(deltaSeconds) ? Math.min(100, Math.max(0, deltaSeconds * 1000)) : 0;
      while (this.accumulator + 1e-6 >= STEP_MS && !this.bundle && !this.error) {
        this.accumulator -= STEP_MS;
        this.fixtureClock += STEP_MS;
        const frame = this.fixtureFrames[Math.min(this.cursor, this.fixtureFrames.length - 1)];
        if (!frame) return;
        const source = this.fixtureClock;
        if (this.fixtureInterrupted) {
          // Suspension deliberately clears acquisition arming. Re-seed the last
          // generated pose before the next waypoint so a paused open->close edge
          // is preserved, without inserting a synthetic evaluation frame.
          const seedTime = source - 0.001;
          this.simulation.update({ ...this.controls, sourceTMs: seedTime,
            left: { ...this.controls.left, lastSeenMs: seedTime },
            right: { ...this.controls.right, lastSeenMs: seedTime } }, seedTime);
          this.fixtureInterrupted = false;
        }
        const control = { ...frame, sourceTMs: source,
          left: { ...frame.left, lastSeenMs: source }, right: { ...frame.right, lastSeenMs: source } };
        this.consume(control, source);
        // Hold the first waypoint throughout Learn's demonstration; never eat
        // the grasp/entry frames before the active attempt begins.
        if (this.exercise.snapshot.phase === "active") this.cursor++;
        if (this.cursor >= this.fixtureFrames.length && !this.bundle && !this.error) {
          this.error = "The demo could not finish. Restart the demo.";
        }
      }
    } else {
      this.consume(liveControls, nowMs);
    }
    this.ghost.update(this.exercise.snapshot, deltaSeconds);
  }
  private consume(controls: ControlSnapshot, nowMs: number) {
    this.controls = controls;
    if (!controls.calibrated) { this.invalidateCalibration(); return; }
    const events = this.simulation.update(controls, nowMs);
    if (this.simulation.snapshot.object.heldBy) this.ghost.setActiveSide(this.simulation.snapshot.object.heldBy === "left-tool" ? "left" : "right");
    const snapshot = this.exercise.update(controls, this.simulation.snapshot, events, nowMs);
    if (!snapshot.canProgress) { this.suspend(this.simulation.snapshot.reason); return; }
    if (snapshot.sourceTMs === this.lastSource) return;
    this.lastSource = snapshot.sourceTMs;
    if (snapshot.phase === "active" && !this.attemptId) this.attemptId = crypto.randomUUID();
    const signals = this.signals.sample(this.simulation.snapshot, snapshot);
    if (signals.tMs - this.lastCoachingMs >= 1000 / 3 || snapshot.phase !== "active") {
      this.lastCoachingMs = signals.tMs;
      const tick = this.coaching.evaluate(signals);
      if (tick.spoken) { this.message = tick.spoken.text; this.messageUntilMs = signals.tMs + 4000; }
      else if (tick.canceledPending || snapshot.phase !== "active" || signals.tMs >= this.messageUntilMs) this.message = null;
    }
    if (snapshot.frameCount >= EXERCISE_THRESHOLDS.maxRecordedFrames) {
      this.error = "The recording limit was reached. Restart the attempt."; return;
    }
    if (snapshot.phase === "complete" && snapshot.readyForEvaluation) this.finish();
  }
  private finish() {
    try {
      this.bundle = evaluateCompletedAttempt({ recorded: this.exercise.getRecordedMotion(), reference: this.reference,
        skill: this.skill, mode: this.exercise.snapshot.mode, singleHand: this.singleHand,
        attemptId: this.attemptId ?? crypto.randomUUID(), importantEvents: [...this.coaching.events] });
      this.message = null;
      if (this.fixtureId) { this.saveStatus = "demo"; return; }
      this.saveStatus = "saving";
      const generation = this.generation;
      void saveCompletedAttempt(this.bundle.savedAttempt).then(status => {
        if (this.generation === generation) this.saveStatus = status;
      }).catch(() => { if (this.generation === generation) this.saveStatus = "memory"; });
    } catch {
      this.error = "The attempt could not be evaluated. Restart the attempt to record a complete pass.";
    }
  }
}
