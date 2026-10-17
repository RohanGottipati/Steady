import { buildDeterministicReview } from "@/lib/ai/deterministic-review";
import { requestAttemptReview, type AttemptReview } from "@/lib/ai/request-review";
import { CoachingEngine, DEFAULT_COACHING_CONFIG } from "@/lib/coaching/coaching-engine";
import { ToolSimulationController } from "@/lib/simulation/tool-simulation";
import type { CompletedReplay } from "@/lib/simulation/replay-types";
import { saveCompletedAttempt, type CachePersistence } from "@/lib/storage/attempt-cache";
import { syncSavedAttempt, type CloudSyncResult } from "@/lib/storage/cloud-sync";
import { emptyControlSnapshot, type ControlSnapshot } from "@/lib/vision/control-types";
import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { CoachingEventType, SkillDefinition, TrainingMode } from "@/types";
import { adaptReferenceForAttempt, evaluateCompletedAttempt, type CompletedAttemptBundle } from "./attempt-evaluator";
import { CoachingSignalsAdapter } from "./coaching-signals";
import { ExerciseController } from "./exercise-controller";
import { buildFixtureControlFrames, type FixtureId } from "./fixture-playback";
import { GhostPlaybackController } from "./ghost-playback";
import { EXERCISE_THRESHOLDS } from "./needle-passing-config";
import { PEG_HOME, PEG_ID, PEG_TRANSFER_THRESHOLDS } from "./peg-transfer-config";
import { referenceForSkill } from "./peg-transfer-reference";

const STEP_MS = 1000 / 30;
export class TrainingRuntime {
  readonly simulation: ToolSimulationController;
  readonly exercise: ExerciseController;
  readonly ghost: GhostPlaybackController;
  readonly coaching: CoachingEngine;
  private readonly signals = new CoachingSignalsAdapter();
  controls: ControlSnapshot = emptyControlSnapshot();
  bundle: CompletedAttemptBundle | null = null;
  review: AttemptReview | null = null;
  private reviewEpoch = 0;
  // Detached from the active exercise: resets/camera shutdown must not erase it.
  lastReplay: CompletedReplay | null = null;
  error: string | null = null;
  message: string | null = null;
  saveStatus: "idle" | "saving" | "demo" | CachePersistence = "idle";
  cloudStatus: "idle" | "syncing" | CloudSyncResult = "idle";
  /** Live speech is skipped for fixtures. A throw becomes silence; the text line stays. */
  private speaker: ((type: CoachingEventType, allowLive: boolean) => void) | null = null;
  attachSpeaker(speaker: (type: CoachingEventType, allowLive: boolean) => void) {
    this.speaker = speaker;
    return () => { if (this.speaker === speaker) this.speaker = null; };
  }
  generation = 0;
  private syncEpoch = 0;
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
  private reference: ReturnType<typeof referenceForSkill>;
  private singleHand = false;
  private assisted = true;

  constructor(readonly skill: SkillDefinition = needlePassingSkill, mode: TrainingMode = "learn") {
    const corridorTolerance = skill.id === "peg-transfer"
      ? PEG_TRANSFER_THRESHOLDS.corridorToleranceUnits
      : EXERCISE_THRESHOLDS.corridorToleranceUnits;
    this.simulation = new ToolSimulationController({
      taskObject: skill.id === "peg-transfer" ? { id: PEG_ID, position: { ...PEG_HOME } } : undefined,
    });
    this.exercise = new ExerciseController({ skill, mode });
    this.reference = structuredClone(referenceForSkill(skill));
    this.ghost = new GhostPlaybackController({ reference: this.reference });
    this.coaching = new CoachingEngine({
      ...DEFAULT_COACHING_CONFIG,
      thresholds: {
        ...DEFAULT_COACHING_CONFIG.thresholds,
        corridorToleranceUnits: corridorTolerance,
        rotationBehindToleranceDeg: skill.id === "peg-transfer" ? 8 : 3,
        rotationSeverityRangeDeg: skill.id === "peg-transfer" ? 20 : 12,
      },
    });
  }

  reset(newSource = false) {
    this.reviewEpoch++;
    this.review = null;
    this.generation++;
    this.syncEpoch++;
    this.simulation.reset(!newSource);
    this.exercise.reset(!newSource);
    this.ghost.reset();
    this.coaching.reset();
    this.signals.reset();
    this.bundle = null; this.error = null; this.message = null; this.saveStatus = "idle"; this.cloudStatus = "idle";
    this.attemptId = null; this.lastSource = null; this.lastCoachingMs = -Infinity; this.messageUntilMs = 0;
    this.reference = structuredClone(referenceForSkill(this.skill));
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
      if (tick.spoken) {
        this.message = tick.spoken.text;
        this.messageUntilMs = signals.tMs + 4000;
        try { this.speaker?.(tick.spoken.event.type, !this.fixtureId); } catch { /* On-screen text remains. */ }
      }
      else if (tick.canceledPending || snapshot.phase !== "active" || signals.tMs >= this.messageUntilMs) this.message = null;
    }
    if (snapshot.frameCount >= EXERCISE_THRESHOLDS.maxRecordedFrames) {
      this.error = "The recording limit was reached. Restart the attempt."; return;
    }
    if (snapshot.phase === "complete" && snapshot.readyForEvaluation) this.finish();
  }
  retryCloudSync() {
    const attempt = this.bundle?.savedAttempt;
    if (!attempt || this.fixtureId || this.cloudStatus === "syncing" || this.cloudStatus === "synced") return;
    const epoch = this.syncEpoch;
    this.cloudStatus = "syncing";
    this.publish();
    void syncSavedAttempt(attempt).then(result => {
      if (this.syncEpoch !== epoch) return;
      this.cloudStatus = result;
      this.publish();
    }).catch(() => {
      if (this.syncEpoch !== epoch) return;
      this.cloudStatus = "local-only";
      this.publish();
    });
  }
  private publish() {
    this.generation++;
    this.listeners.forEach(listener => listener());
  }
  private finish() {
    try {
      const bundle = evaluateCompletedAttempt({ recorded: this.exercise.getRecordedMotion(), reference: this.reference,
        skill: this.skill, mode: this.exercise.snapshot.mode, singleHand: this.singleHand,
        attemptId: this.attemptId ?? crypto.randomUUID(), importantEvents: [...this.coaching.events] });
      const recording = this.exercise.getReplayRecording();
      const review = buildDeterministicReview(bundle);
      this.lastReplay = {
        attemptId: bundle.attemptResult.id,
        source: this.fixtureId ? "fixture" : "webcam",
        input: { skillId: recording.skillId, userFrames: recording.frames, sceneFrames: recording.sceneFrames,
          truncated: recording.truncated,
          reference: structuredClone(adaptReferenceForAttempt(this.reference, recording, { singleHand: this.singleHand })) },
        markers: structuredClone(bundle.attemptResult.worstMoments),
        mode: this.exercise.snapshot.mode,
        review: { replayNarration: review.replayNarration },
      };
      this.bundle = bundle;
      this.review = { source: "deterministic", review, notice: null };
      this.message = null;
      if (this.fixtureId) { this.saveStatus = "demo"; this.cloudStatus = "idle"; return; }
      const reviewEpoch = this.reviewEpoch;
      void requestAttemptReview(bundle).then(accepted => {
        if (this.reviewEpoch !== reviewEpoch || this.bundle !== bundle) return;
        this.review = accepted;
        if (this.lastReplay?.attemptId === bundle.attemptResult.id) {
          this.lastReplay = { ...this.lastReplay, review: { replayNarration: accepted.review.replayNarration } };
        }
        this.generation++;
        this.listeners.forEach(listener => listener());
      });
      this.saveStatus = "saving";
      const epoch = this.syncEpoch;
      void saveCompletedAttempt(this.bundle.savedAttempt).then(status => {
        if (this.syncEpoch !== epoch) return;
        this.saveStatus = status;
        this.cloudStatus = "syncing";
        this.publish();
        void syncSavedAttempt(bundle.savedAttempt).then(result => {
          if (this.syncEpoch !== epoch) return;
          this.cloudStatus = result;
          this.publish();
        }).catch(() => {
          if (this.syncEpoch !== epoch) return;
          this.cloudStatus = "local-only";
          this.publish();
        });
      }).catch(() => {
        if (this.syncEpoch !== epoch) return;
        this.saveStatus = "memory";
        this.cloudStatus = "local-only";
        this.publish();
      });
    } catch {
      this.error = "The attempt could not be evaluated. Restart the attempt to record a complete pass.";
    }
  }
}
