import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { RecordedMotion } from "@/lib/evaluation/types";
import { ASSISTED_GRAB_RADIUS, GRAB_RADIUS, NEEDLE_ID, type SimulationEvent, type SimulationSnapshot } from "@/lib/simulation/tool-simulation";
import { CONTROL_TIMING, type ControlSnapshot } from "@/lib/vision/control-types";
import type { HandFrame, MotionFrame, NeedlePassingSegment, Quat, SkillDefinition, ToolState, TrainingMode } from "@/types";
import {
  corridorMetrics,
  ENTRY_TARGET_ROTATION,
  EXERCISE_THRESHOLDS,
  NEEDLE_PASSING_RINGS,
  pointDistance,
  pointInBox,
  quatAngleDegrees,
  RELEASE_ZONE,
  TISSUE_WALL_ZONE,
  validateSkillSceneConfig,
  type ActiveTargetId,
  type DangerZoneId,
  type TargetRingId,
} from "./needle-passing-config";

export type ExercisePhase = "idle" | "demonstration" | "active" | "complete";

export interface ModeBehaviorHooks {
  mode: TrainingMode;
  ghostVisible: boolean;
  canToggleGhost: boolean;
  ghostAutoTriggered: boolean;
  showPathGuide: boolean;
  highlightCurrentTarget: boolean;
  voiceCoachingLevel: "full" | "high-severity" | "none";
  showLiveCoaching: boolean;
}

export interface SegmentTransitionRecord {
  from: NeedlePassingSegment;
  to: NeedlePassingSegment;
  attemptTMs: number;
  sourceTMs: number;
}

export interface ExerciseSnapshot {
  skillId: string;
  mode: TrainingMode;
  phase: ExercisePhase;
  segmentId: NeedlePassingSegment;
  segmentIndex: number;
  segmentCount: number;
  segmentTitle: string;
  segmentInstructions: string;
  segmentProgress: number;
  overallProgress: number;
  activeTargetId: ActiveTargetId;
  completedTargetIds: TargetRingId[];
  corridorDeviation: number;
  orientationErrorDeg: number;
  rotationDeltaDeg: number;
  inDangerZone: boolean;
  activeDangerZoneIds: DangerZoneId[];
  dangerZoneCount: number;
  dangerZoneDurationMs: number;
  needleDropped: boolean;
  elapsedActiveMs: number;
  demonstrationProgress: number;
  modeHooks: ModeBehaviorHooks;
  readyForEvaluation: boolean;
  readyForReplay: boolean;
  frameCount: number;
  sourceTMs: number | null;
  canProgress: boolean;
  message: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const cloneTool = (tool: ToolState): ToolState => ({
  ...tool,
  position: { ...tool.position },
  rotation: { ...tool.rotation },
  tipPosition: { ...tool.tipPosition },
});
const cloneHand = (hand: HandFrame | null | undefined): HandFrame | undefined =>
  hand
    ? {
        ...hand,
        landmarks: hand.landmarks.map(point => ({ ...point })),
        worldLandmarks: hand.worldLandmarks.map(point => ({ ...point })),
        palmCenter: { ...hand.palmCenter },
        palmRotation: { ...hand.palmRotation },
      }
    : undefined;

export function buildModeHooks(mode: TrainingMode, manualGhost: boolean | null, autoGhost: boolean): ModeBehaviorHooks {
  if (mode === "assessment") {
    return {
      mode,
      ghostVisible: false,
      canToggleGhost: false,
      ghostAutoTriggered: false,
      showPathGuide: false,
      highlightCurrentTarget: false,
      voiceCoachingLevel: "none",
      showLiveCoaching: false,
    };
  }
  if (mode === "learn") {
    return {
      mode,
      ghostVisible: true,
      canToggleGhost: false,
      ghostAutoTriggered: false,
      showPathGuide: true,
      highlightCurrentTarget: true,
      voiceCoachingLevel: "full",
      showLiveCoaching: true,
    };
  }
  return {
    mode,
    ghostVisible: manualGhost ?? autoGhost,
    canToggleGhost: true,
    ghostAutoTriggered: autoGhost && manualGhost !== false,
    showPathGuide: true,
    highlightCurrentTarget: true,
    voiceCoachingLevel: "high-severity",
    showLiveCoaching: true,
  };
}

export class ExerciseController {
  readonly skill: SkillDefinition;
  snapshot: ExerciseSnapshot;
  transitions: SegmentTransitionRecord[] = [];
  private mode: TrainingMode;
  private manualGhost: boolean | null = null;
  private autoGhost = false;
  private sustainedDeviationMs = 0;
  private demonstrationMs = 0;
  private elapsedActiveMs = 0;
  private lastSourceTMs = -Infinity;
  private entryRotation: Quat | null = null;
  private maxRotationDeltaDeg = 0;
  private ring2Reached = false;
  private rotationGatePassed = false;
  private wasInDangerZone = false;
  private dangerZoneCount = 0;
  private dangerZoneDurationMs = 0;
  private completedTargets: TargetRingId[] = [];
  private frames: MotionFrame[] = [];
  private segmentFrames = new Map<NeedlePassingSegment, number>();

  constructor({ skill = needlePassingSkill, mode = "practice" }: { skill?: SkillDefinition; mode?: TrainingMode } = {}) {
    this.skill = validateSkillSceneConfig(skill);
    this.mode = mode;
    this.snapshot = this.initialSnapshot("idle", "Calibrate both hands to begin the exercise.");
  }

  private segmentMeta(index: number) {
    const clampedIndex = Math.min(this.skill.segments.length - 1, Math.max(0, index));
    const seg = this.skill.segments[clampedIndex];
    const instructions =
      seg.id === "approach"
        ? "Move ONE open instrument tip (left cyan or right amber) into the needle's pickup circle."
        : seg.instructions;
    return {
      index: clampedIndex,
      id: seg.id as NeedlePassingSegment,
      title: seg.title,
      instructions,
    };
  }

  private initialSnapshot(phase: ExercisePhase, message: string): ExerciseSnapshot {
    const seg = this.segmentMeta(0);
    return {
      skillId: this.skill.id,
      mode: this.mode,
      phase,
      segmentId: seg.id,
      segmentIndex: 0,
      segmentCount: this.skill.segments.length,
      segmentTitle: seg.title,
      segmentInstructions: seg.instructions,
      segmentProgress: 0,
      overallProgress: 0,
      activeTargetId: NEEDLE_ID,
      completedTargetIds: [],
      corridorDeviation: 0,
      orientationErrorDeg: 0,
      rotationDeltaDeg: 0,
      inDangerZone: false,
      activeDangerZoneIds: [],
      dangerZoneCount: 0,
      dangerZoneDurationMs: 0,
      needleDropped: false,
      elapsedActiveMs: 0,
      demonstrationProgress: phase === "demonstration" ? 0 : 1,
      modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
      readyForEvaluation: false,
      readyForReplay: false,
      frameCount: 0,
      sourceTMs: null,
      canProgress: false,
      message,
    };
  }

  setMode(mode: TrainingMode) {
    if (!this.skill.availableModes.includes(mode)) return;
    this.mode = mode;
    this.manualGhost = null;
    this.autoGhost = false;
    this.reset();
  }

  toggleGhost(): boolean {
    if (this.mode !== "practice") return this.snapshot.modeHooks.ghostVisible;
    const current = this.snapshot.modeHooks.ghostVisible;
    this.manualGhost = !current;
    if (current) this.autoGhost = false;
    this.snapshot = {
      ...this.snapshot,
      modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
    };
    return this.snapshot.modeHooks.ghostVisible;
  }

  setGhostVisible(visible: boolean): boolean {
    if (this.mode !== "practice") return this.snapshot.modeHooks.ghostVisible;
    this.manualGhost = visible;
    if (!visible) this.autoGhost = false;
    this.snapshot = {
      ...this.snapshot,
      modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
    };
    return this.snapshot.modeHooks.ghostVisible;
  }

  startAttempt() {
    if (this.snapshot.phase !== "demonstration") return;
    const seg = this.segmentMeta(0);
    this.demonstrationMs = EXERCISE_THRESHOLDS.demonstrationDurationMs;
    this.snapshot = {
      ...this.snapshot,
      phase: "active",
      demonstrationProgress: 1,
      message: this.formatMessage(seg.title, seg.instructions),
    };
  }

  reset(retainWatermark = true) {
    if (!retainWatermark) this.lastSourceTMs = -Infinity;
    this.transitions = [];
    this.autoGhost = false;
    this.sustainedDeviationMs = 0;
    this.demonstrationMs = 0;
    this.elapsedActiveMs = 0;
    this.entryRotation = null;
    this.maxRotationDeltaDeg = 0;
    this.ring2Reached = false;
    this.rotationGatePassed = false;
    this.wasInDangerZone = false;
    this.dangerZoneCount = 0;
    this.dangerZoneDurationMs = 0;
    this.completedTargets = [];
    this.frames = [];
    this.segmentFrames.clear();
    this.snapshot = this.initialSnapshot("idle", "Calibrate both hands to begin the exercise.");
  }

  suspend(reason = "Exercise paused until both controls are tracking.") {
    this.wasInDangerZone = false;
    this.snapshot = {
      ...this.snapshot,
      canProgress: false,
      message: reason,
    };
  }

  getRecordedMotion(): RecordedMotion {
    return {
      skillId: this.skill.id,
      frames: this.frames.map(frame => ({
        ...frame,
        leftTool: cloneTool(frame.leftTool),
        rightTool: cloneTool(frame.rightTool),
        leftHand: cloneHand(frame.leftHand),
        rightHand: cloneHand(frame.rightHand),
      })),
    };
  }

  private formatMessage(title: string, liveInstruction: string): string {
    return this.snapshot.modeHooks.showLiveCoaching ? `${title}: ${liveInstruction}` : `Segment: ${title}`;
  }

  private recordFrame(
    segmentId: NeedlePassingSegment,
    normalizedProgress: number,
    simulation: SimulationSnapshot,
    controls: ControlSnapshot,
  ) {
    if (!simulation.left || !simulation.right || this.frames.length >= EXERCISE_THRESHOLDS.maxRecordedFrames) return;
    const clampedProgress = clamp(normalizedProgress, 0, 1);
    this.frames.push({
      tMs: Math.max(0, Math.round(this.elapsedActiveMs * 1000) / 1000),
      segmentId,
      normalizedProgress: clampedProgress,
      leftTool: cloneTool(simulation.left),
      rightTool: cloneTool(simulation.right),
      leftHand: cloneHand(controls.left.hand),
      rightHand: cloneHand(controls.right.hand),
    });
    this.segmentFrames.set(segmentId, (this.segmentFrames.get(segmentId) ?? 0) + 1);
  }

  private computeOverallProgress(segmentIndex: number, segmentProgress: number): number {
    if (segmentIndex >= this.skill.segments.length - 1) return 1;
    const activeSegments = this.skill.segments.length - 1;
    const raw = (segmentIndex + clamp(segmentProgress, 0, 1)) / activeSegments;
    return Math.max(this.snapshot.overallProgress, clamp(raw, 0, 0.99));
  }

  update(
    controls: ControlSnapshot,
    simulation: SimulationSnapshot,
    events: readonly SimulationEvent[] = [],
    nowMs: number,
  ): ExerciseSnapshot {
    if (!controls.calibrated) {
      if (this.snapshot.phase !== "idle" || this.frames.length > 0) {
        this.reset();
      }
      return this.snapshot;
    }

    const source = simulation.sourceTMs ?? controls.sourceTMs;
    const validTime =
      Number.isFinite(nowMs) &&
      source !== null &&
      Number.isFinite(source) &&
      source <= nowMs &&
      nowMs - source < CONTROL_TIMING.freshnessMs;

    if (!validTime || !simulation.canProgress || (!simulation.singleHand && !controls.canProgress) || !simulation.left || !simulation.right) {
      this.suspend(simulation.reason || "Exercise paused until controls are tracking.");
      return this.snapshot;
    }

    if (source < this.lastSourceTMs) {
      this.suspend("Exercise paused: reordered controls.");
      return this.snapshot;
    }

    if (source === this.lastSourceTMs) {
      return this.snapshot;
    }

    const rawDeltaMs = Number.isFinite(this.lastSourceTMs) ? source - this.lastSourceTMs : 0;
    const stepMs = rawDeltaMs > 0 && rawDeltaMs <= CONTROL_TIMING.maxSampleGapMs ? rawDeltaMs : 33.333;
    this.lastSourceTMs = source;

    if (this.snapshot.phase === "idle") {
      if (this.mode === "learn" && !simulation.object.heldBy) {
        this.demonstrationMs = 0;
        this.snapshot = {
          ...this.snapshot,
          phase: "demonstration",
          demonstrationProgress: 0,
          sourceTMs: source,
          canProgress: true,
          modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
          message: "Learn demonstration: watch the target path through Rings 1–3, or select Start attempt.",
        };
        return this.snapshot;
      }
      const seg = this.segmentMeta(0);
      this.snapshot = {
        ...this.snapshot,
        phase: "active",
        demonstrationProgress: 1,
        sourceTMs: source,
        canProgress: true,
        modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
        message: this.formatMessage(seg.title, seg.instructions),
      };
    }

    if (this.snapshot.phase === "demonstration") {
      const grabbed = simulation.object.heldBy !== null || events.some(event => event.kind === "grab");
      this.demonstrationMs = Math.min(EXERCISE_THRESHOLDS.demonstrationDurationMs, this.demonstrationMs + stepMs);
      const demoProgress = clamp(this.demonstrationMs / EXERCISE_THRESHOLDS.demonstrationDurationMs, 0, 1);
      if (!grabbed && demoProgress < 1) {
        this.snapshot = {
          ...this.snapshot,
          demonstrationProgress: demoProgress,
          sourceTMs: source,
          canProgress: true,
          modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
          message: "Learn demonstration: watch the target path through Rings 1–3, or select Start attempt.",
        };
        return this.snapshot;
      }
      const seg = this.segmentMeta(0);
      this.snapshot = {
        ...this.snapshot,
        phase: "active",
        demonstrationProgress: 1,
        sourceTMs: source,
        canProgress: true,
        message: this.formatMessage(seg.title, seg.instructions),
      };
    }

    if (this.snapshot.phase === "complete") {
      this.snapshot = { ...this.snapshot, sourceTMs: source, canProgress: true };
      return this.snapshot;
    }

    if (this.frames.length > 0) {
      this.elapsedActiveMs += stepMs;
    }

    const leftTip = simulation.left.tipPosition;
    const rightTip = simulation.right.tipPosition;
    const needlePos = simulation.object.position;
    const heldTool =
      simulation.object.heldBy === "left-tool"
        ? simulation.left
        : simulation.object.heldBy === "right-tool"
          ? simulation.right
          : null;
    const assisted = simulation.assisted;

    const inDangerZone =
      pointInBox(leftTip, TISSUE_WALL_ZONE) ||
      pointInBox(rightTip, TISSUE_WALL_ZONE) ||
      (heldTool !== null && pointInBox(needlePos, TISSUE_WALL_ZONE));

    if (inDangerZone) {
      if (!this.wasInDangerZone) this.dangerZoneCount++;
      this.dangerZoneDurationMs += stepMs;
    }
    this.wasInDangerZone = inDangerZone;

    const corridorPoint = heldTool ? needlePos : leftTip.x <= rightTip.x ? leftTip : rightTip;
    const { deviation: corridorDeviation } = corridorMetrics(corridorPoint);

    let segmentIndex = this.snapshot.segmentIndex;
    let segmentMeta = this.segmentMeta(segmentIndex);
    const inCorridorSegment =
      segmentMeta.id === "align" ||
      segmentMeta.id === "entry" ||
      segmentMeta.id === "rotation" ||
      segmentMeta.id === "exit";

    if (inCorridorSegment && heldTool && corridorDeviation > EXERCISE_THRESHOLDS.corridorToleranceUnits) {
      this.sustainedDeviationMs += stepMs;
      if (this.mode === "practice" && this.sustainedDeviationMs >= EXERCISE_THRESHOLDS.sustainedDeviationMs && this.manualGhost === null) {
        this.autoGhost = true;
      }
    } else {
      this.sustainedDeviationMs = 0;
    }

    const modeHooks = buildModeHooks(this.mode, this.manualGhost, this.autoGhost);
    const ring1 = NEEDLE_PASSING_RINGS[0];
    const ring2 = NEEDLE_PASSING_RINGS[1];
    const ring3 = NEEDLE_PASSING_RINGS[2];

    const grabRadius = assisted ? ASSISTED_GRAB_RADIUS : GRAB_RADIUS;
    const alignRadius1 = assisted ? ring1.alignRadius.assisted : ring1.alignRadius.free;
    const gateRadius1 = assisted ? ring1.gateRadius.assisted : ring1.gateRadius.free;
    const engageRadius2 = assisted ? ring2.alignRadius.assisted : ring2.alignRadius.free;
    const gateRadius2 = assisted ? ring2.gateRadius.assisted : ring2.gateRadius.free;
    const gateRadius3 = assisted ? ring3.gateRadius.assisted : ring3.gateRadius.free;
    const releaseRadius = assisted ? RELEASE_ZONE.radius.assisted : RELEASE_ZONE.radius.free;

    let orientationErrorDeg = heldTool ? quatAngleDegrees(heldTool.rotation, ENTRY_TARGET_ROTATION) : 0;
    if (this.entryRotation && heldTool && (segmentMeta.id === "rotation" || segmentMeta.id === "exit")) {
      const delta = quatAngleDegrees(heldTool.rotation, this.entryRotation);
      if (segmentMeta.id === "rotation") {
        this.maxRotationDeltaDeg = Math.max(this.maxRotationDeltaDeg, delta);
      }
    }

    let segmentProgress = this.snapshot.segmentProgress;
    let activeTargetId: ActiveTargetId = this.snapshot.activeTargetId;
    let needleDropped = false;
    let liveInstruction = segmentMeta.instructions;
    let shouldAdvance = false;

    if (segmentMeta.id === "approach") {
      activeTargetId = NEEDLE_ID;
      const nearestDist = Math.min(pointDistance(leftTip, needlePos), pointDistance(rightTip, needlePos));
      const hadApproachFrame = (this.segmentFrames.get("approach") ?? 0) > 0;
      segmentProgress = clamp(1 - Math.max(0, nearestDist - grabRadius) / (0.6 - grabRadius), 0, 1);
      liveInstruction = "Move an open instrument tip inside the needle pickup circle.";
      shouldAdvance =
        !inDangerZone && (heldTool !== null || (hadApproachFrame && nearestDist <= EXERCISE_THRESHOLDS.approachRadius));
    } else if (segmentMeta.id === "grip") {
      if (!heldTool) {
        activeTargetId = NEEDLE_ID;
        segmentProgress = 0.25;
        liveInstruction = "Pinch thumb and index finger to grasp the needle.";
      } else {
        activeTargetId = "ring-1";
        const distRing1 = pointDistance(needlePos, ring1.position);
        segmentProgress = clamp(0.5 + 0.5 * (1 - Math.max(0, distRing1 - alignRadius1) / 0.25), 0.5, 1);
        liveInstruction = "Needle held — move the needle toward Entry Ring 1 on the left.";
        shouldAdvance = !inDangerZone && distRing1 <= alignRadius1;
      }
    } else if (segmentMeta.id === "align") {
      activeTargetId = "ring-1";
      if (!heldTool) {
        needleDropped = true;
        activeTargetId = NEEDLE_ID;
        liveInstruction = "Needle released early — pick up the needle again to continue Align.";
      } else {
        const distRing1 = pointDistance(needlePos, ring1.position);
        orientationErrorDeg = quatAngleDegrees(heldTool.rotation, ENTRY_TARGET_ROTATION);
        const aligned = orientationErrorDeg <= EXERCISE_THRESHOLDS.entryOrientationToleranceDeg;
        const posScore = clamp(1 - Math.max(0, distRing1 - gateRadius1) / 0.15, 0, 1);
        const rotScore = aligned ? 1 : clamp(1 - (orientationErrorDeg - EXERCISE_THRESHOLDS.entryOrientationToleranceDeg) / 45, 0, 1);
        segmentProgress = 0.5 * posScore + 0.5 * rotScore;
        liveInstruction = !aligned
          ? "Level your wrist orientation to align with Entry Ring 1."
          : "Drive the aligned needle into Entry Ring 1.";
        if (!inDangerZone && distRing1 <= gateRadius1 && aligned) {
          this.entryRotation = { ...heldTool.rotation };
          if (!this.completedTargets.includes("ring-1")) this.completedTargets = [...this.completedTargets, "ring-1"];
          shouldAdvance = true;
        }
      }
    } else if (segmentMeta.id === "entry") {
      activeTargetId = "ring-2";
      if (!heldTool) {
        needleDropped = true;
        activeTargetId = NEEDLE_ID;
        liveInstruction = "Needle released early — pick up the needle again to continue Entry.";
      } else {
        const distRing2 = pointDistance(needlePos, ring2.position);
        segmentProgress = clamp(1 - Math.max(0, distRing2 - engageRadius2) / 0.18, 0, 1);
        liveInstruction = "Advance the needle along the curved path into Apex Ring 2.";
        shouldAdvance = !inDangerZone && distRing2 <= engageRadius2 && needlePos.x >= -0.08;
      }
    } else if (segmentMeta.id === "rotation") {
      if (!heldTool) {
        needleDropped = true;
        activeTargetId = NEEDLE_ID;
        liveInstruction = "Needle released early — pick up the needle again to continue Rotation.";
      } else {
        const distRing2 = pointDistance(needlePos, ring2.position);
        if (distRing2 <= gateRadius2) this.ring2Reached = true;
        if (this.ring2Reached && this.maxRotationDeltaDeg >= EXERCISE_THRESHOLDS.requiredRotationDeltaDeg) {
          this.rotationGatePassed = true;
          if (!this.completedTargets.includes("ring-2")) this.completedTargets = [...this.completedTargets, "ring-2"];
        }
        activeTargetId = this.rotationGatePassed ? "ring-3" : "ring-2";
        const distRing3 = pointDistance(needlePos, ring3.position);
        const rotFrac = clamp(this.maxRotationDeltaDeg / EXERCISE_THRESHOLDS.requiredRotationDeltaDeg, 0, 1);
        const posFrac = this.rotationGatePassed
          ? clamp(1 - Math.max(0, distRing3 - gateRadius3) / 0.2, 0, 1)
          : this.ring2Reached
            ? 0.5
            : clamp(1 - Math.max(0, distRing2 - gateRadius2) / 0.15, 0, 0.45);
        segmentProgress = 0.5 * rotFrac + 0.5 * posFrac;
        liveInstruction = !this.ring2Reached
          ? "Guide the needle through Apex Ring 2."
          : !this.rotationGatePassed
            ? `Rotate your wrist smoothly through the curve (${Math.round(this.maxRotationDeltaDeg)}° / ${EXERCISE_THRESHOLDS.requiredRotationDeltaDeg}°).`
            : "Continue along the arc into Exit Ring 3.";
        if (!inDangerZone && this.rotationGatePassed && distRing3 <= gateRadius3) {
          if (!this.completedTargets.includes("ring-3")) this.completedTargets = [...this.completedTargets, "ring-3"];
          shouldAdvance = true;
        }
      }
    } else if (segmentMeta.id === "exit") {
      activeTargetId = "release-zone";
      if (!heldTool) {
        needleDropped = true;
        activeTargetId = NEEDLE_ID;
        liveInstruction = "Needle released early — pick up the needle again to pull through to the release zone.";
      } else {
        const distRelease = pointDistance(needlePos, RELEASE_ZONE.position);
        segmentProgress = clamp(1 - Math.max(0, distRelease - releaseRadius) / 0.18, 0, 1);
        liveInstruction = "Pull the needle clear of Exit Ring 3 into the upper-right release zone.";
        shouldAdvance = !inDangerZone && distRelease <= releaseRadius;
      }
    } else if (segmentMeta.id === "release") {
      activeTargetId = "release-zone";
      const distRelease = pointDistance(needlePos, RELEASE_ZONE.position);
      const inReleaseZone = distRelease <= releaseRadius + 0.01;
      if (heldTool) {
        segmentProgress = inReleaseZone ? 0.65 : 0.25;
        liveInstruction = inReleaseZone
          ? "Inside release zone — open your thumb and index finger to release the needle."
          : "Move the held needle into the release zone before opening your hand.";
      } else if (inReleaseZone && !inDangerZone) {
        segmentProgress = 1;
        shouldAdvance = true;
      } else {
        needleDropped = true;
        activeTargetId = NEEDLE_ID;
        segmentProgress = 0.2;
        liveInstruction = "Needle released outside the release zone — pick it up and release inside the target ring.";
      }
    }

    if (inDangerZone) {
      liveInstruction = "Danger zone: move instruments up and away from the tissue wall.";
    }

    const hadSegmentFrame = (this.segmentFrames.get(segmentMeta.id) ?? 0) > 0;

    if (shouldAdvance && !hadSegmentFrame) {
      const preTransitionProgress = this.computeOverallProgress(segmentIndex, 0.9);
      this.recordFrame(segmentMeta.id, preTransitionProgress, simulation, controls);
      this.elapsedActiveMs += 1;
    }

    if (shouldAdvance) {
      const nextIndex = Math.min(this.skill.segments.length - 1, segmentIndex + 1);
      const nextMeta = this.segmentMeta(nextIndex);
      this.transitions.push({
        from: segmentMeta.id,
        to: nextMeta.id,
        attemptTMs: Math.round(this.elapsedActiveMs * 1000) / 1000,
        sourceTMs: source,
      });
      segmentIndex = nextIndex;
      segmentMeta = nextMeta;

      if (segmentMeta.id === "complete") {
        this.recordFrame("complete", 1, simulation, controls);
        this.snapshot = {
          skillId: this.skill.id,
          mode: this.mode,
          phase: "complete",
          segmentId: "complete",
          segmentIndex,
          segmentCount: this.skill.segments.length,
          segmentTitle: segmentMeta.title,
          segmentInstructions: segmentMeta.instructions,
          segmentProgress: 1,
          overallProgress: 1,
          activeTargetId: null,
          completedTargetIds: [...this.completedTargets],
          corridorDeviation,
          orientationErrorDeg,
          rotationDeltaDeg: this.maxRotationDeltaDeg,
          inDangerZone: false,
          activeDangerZoneIds: [],
          dangerZoneCount: this.dangerZoneCount,
          dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
          needleDropped: false,
          elapsedActiveMs: Math.round(this.elapsedActiveMs),
          demonstrationProgress: 1,
          modeHooks,
          readyForEvaluation: true,
          readyForReplay: true,
          frameCount: this.frames.length,
          sourceTMs: source,
          canProgress: true,
          message: this.formatMessage(segmentMeta.title, segmentMeta.instructions),
        };
        return this.snapshot;
      }

      segmentProgress = 0.1;
      liveInstruction = segmentMeta.instructions;
      if (segmentMeta.id === "grip") activeTargetId = heldTool ? "ring-1" : NEEDLE_ID;
      else if (segmentMeta.id === "align") activeTargetId = "ring-1";
      else if (segmentMeta.id === "entry") activeTargetId = "ring-2";
      else if (segmentMeta.id === "rotation") activeTargetId = "ring-2";
      else if (segmentMeta.id === "exit" || segmentMeta.id === "release") activeTargetId = "release-zone";
    }

    const overallProgress = this.computeOverallProgress(segmentIndex, segmentProgress);
    this.recordFrame(segmentMeta.id, overallProgress, simulation, controls);

    this.snapshot = {
      skillId: this.skill.id,
      mode: this.mode,
      phase: "active",
      segmentId: segmentMeta.id,
      segmentIndex,
      segmentCount: this.skill.segments.length,
      segmentTitle: segmentMeta.title,
      segmentInstructions: segmentMeta.instructions,
      segmentProgress,
      overallProgress,
      activeTargetId,
      completedTargetIds: [...this.completedTargets],
      corridorDeviation,
      orientationErrorDeg,
      rotationDeltaDeg: this.maxRotationDeltaDeg,
      inDangerZone,
      activeDangerZoneIds: inDangerZone ? [TISSUE_WALL_ZONE.id] : [],
      dangerZoneCount: this.dangerZoneCount,
      dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
      needleDropped,
      elapsedActiveMs: Math.round(this.elapsedActiveMs),
      demonstrationProgress: 1,
      modeHooks,
      readyForEvaluation: false,
      readyForReplay: false,
      frameCount: this.frames.length,
      sourceTMs: source,
      canProgress: true,
      message: this.formatMessage(segmentMeta.title, liveInstruction),
    };
    return this.snapshot;
  }
}
