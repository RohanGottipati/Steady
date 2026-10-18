import { needlePassingSkill } from "@/data/skills/needle-passing";
import type { RecordedMotion } from "@/lib/evaluation/types";
import { ASSISTED_GRAB_RADIUS, GRAB_RADIUS, NEEDLE_ID, type SimulationEvent, type SimulationSnapshot } from "@/lib/simulation/tool-simulation";
import { CONTROL_TIMING, type ControlSnapshot } from "@/lib/vision/control-types";
import type { ReplayRecording, ReplaySceneFrame } from "@/lib/simulation/replay-types";
import type { HandFrame, MotionFrame, Quat, SkillDefinition, ToolState, TrainingMode } from "@/types";
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
} from "./needle-passing-config";
import {
  BOARD_EDGE_ZONE,
  PEG_HOME,
  PEG_ID,
  PEG_TRANSFER_THRESHOLDS,
  SOURCE_POST,
  TARGET_POST,
  TRANSFER_ZONE,
  pegCorridorDeviation,
  pegLiftHeight,
  validatePegTransferSceneConfig,
} from "./peg-transfer-config";
import { getRouteTask, ROUTE_THRESHOLDS, stepRouteTask, validateRouteSkill } from "./route-tasks";

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
  from: string;
  to: string;
  attemptTMs: number;
  sourceTMs: number;
}

export interface ExerciseSnapshot {
  skillId: string;
  mode: TrainingMode;
  phase: ExercisePhase;
  segmentId: string;
  segmentIndex: number;
  segmentCount: number;
  segmentTitle: string;
  segmentInstructions: string;
  segmentProgress: number;
  overallProgress: number;
  activeTargetId: string | null;
  completedTargetIds: string[];
  corridorDeviation: number;
  orientationErrorDeg: number;
  rotationDeltaDeg: number;
  inDangerZone: boolean;
  activeDangerZoneIds: string[];
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
  private completedTargets: string[] = [];
  private frames: MotionFrame[] = [];
  private replaySceneFrames: ReplaySceneFrame[] = [];
  private recordingTruncated = false;
  private segmentFrames = new Map<string, number>();
  private routeSawRelease = false;

  constructor({ skill = needlePassingSkill, mode = "practice" }: { skill?: SkillDefinition; mode?: TrainingMode } = {}) {
    this.skill = skill.id === "peg-transfer"
      ? validatePegTransferSceneConfig(skill)
      : getRouteTask(skill.id)
        ? validateRouteSkill(skill)
        : validateSkillSceneConfig(skill);
    this.mode = mode;
    this.snapshot = this.initialSnapshot("idle", "Calibrate both hands to begin the exercise.");
  }

  private segmentMeta(index: number) {
    const clampedIndex = Math.min(this.skill.segments.length - 1, Math.max(0, index));
    const seg = this.skill.segments[clampedIndex];
    const instructions =
      this.skill.id === "needle-passing" && seg.id === "approach"
        ? "Move ONE open instrument tip (left cyan or right amber) into the needle's pickup circle."
        : seg.instructions;
    return {
      index: clampedIndex,
      id: seg.id,
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
      activeTargetId: this.skill.id === "peg-transfer" ? PEG_ID : getRouteTask(this.skill.id)?.objectId ?? NEEDLE_ID,
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
    this.demonstrationMs = this.demonstrationDurationMs();
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
    this.replaySceneFrames = [];
    this.recordingTruncated = false;
    this.routeSawRelease = false;
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

  getReplayRecording(): ReplayRecording {
    return {
      skillId: this.skill.id,
      // Replay does not need the optional landmark observations used by metrics.
      frames: this.frames.map(frame => ({ tMs: frame.tMs, segmentId: frame.segmentId,
        normalizedProgress: frame.normalizedProgress,
        leftTool: cloneTool(frame.leftTool), rightTool: cloneTool(frame.rightTool) })),
      sceneFrames: structuredClone(this.replaySceneFrames),
      truncated: this.recordingTruncated,
    };
  }

  private formatMessage(title: string, liveInstruction: string): string {
    return this.snapshot.modeHooks.showLiveCoaching ? `${title}: ${liveInstruction}` : `Segment: ${title}`;
  }

  private demonstrationDurationMs(): number {
    if (this.skill.id === "peg-transfer") return PEG_TRANSFER_THRESHOLDS.demonstrationDurationMs;
    if (getRouteTask(this.skill.id)) return ROUTE_THRESHOLDS.demonstrationDurationMs;
    return EXERCISE_THRESHOLDS.demonstrationDurationMs;
  }

  private demonstrationMessage(): string {
    return getRouteTask(this.skill.id)?.demoMessage
      ?? (this.skill.id === "peg-transfer"
        ? "Learn demonstration: watch the peg move from the left post through the midline to the right post, or select Start attempt."
        : "Learn demonstration: watch the target path through Rings 1–3, or select Start attempt.");
  }

  private recordFrame(
    segmentId: string,
    normalizedProgress: number,
    simulation: SimulationSnapshot,
    controls: ControlSnapshot,
  ) {
    if (!simulation.left || !simulation.right) return;
    if (this.frames.length >= EXERCISE_THRESHOLDS.maxRecordedFrames) {
      this.recordingTruncated = true;
      return;
    }
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
    this.replaySceneFrames.push({
      needle: { ...simulation.object, position: { ...simulation.object.position }, rotation: { ...simulation.object.rotation } },
      visible: {
        left: !simulation.singleHand || controls.left.status === "tracking" || simulation.object.heldBy === "left-tool",
        right: !simulation.singleHand || controls.right.status === "tracking" || simulation.object.heldBy === "right-tool",
      },
    });
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
          message: this.demonstrationMessage(),
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
      this.demonstrationMs = Math.min(this.demonstrationDurationMs(), this.demonstrationMs + stepMs);
      const demoProgress = clamp(this.demonstrationMs / this.demonstrationDurationMs(), 0, 1);
      if (!grabbed && demoProgress < 1) {
        this.snapshot = {
          ...this.snapshot,
          demonstrationProgress: demoProgress,
          sourceTMs: source,
          canProgress: true,
          modeHooks: buildModeHooks(this.mode, this.manualGhost, this.autoGhost),
          message: this.demonstrationMessage(),
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

    if (this.skill.id === "peg-transfer") {
      return this.updatePegTransfer(controls, simulation, source, stepMs);
    }
    if (getRouteTask(this.skill.id)) {
      return this.updateRouteTask(controls, simulation, source, stepMs);
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
    let activeTargetId: string | null = this.snapshot.activeTargetId;
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
          readyForReplay: !this.recordingTruncated,
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

  private updatePegTransfer(
    controls: ControlSnapshot,
    simulation: SimulationSnapshot,
    source: number,
    stepMs: number,
  ): ExerciseSnapshot {
    const leftTip = simulation.left!.tipPosition;
    const rightTip = simulation.right!.tipPosition;
    const peg = simulation.object.position;
    const heldTool =
      simulation.object.heldBy === "left-tool"
        ? simulation.left
        : simulation.object.heldBy === "right-tool"
          ? simulation.right
          : null;
    const otherTip = simulation.object.heldBy === "left-tool"
      ? rightTip
      : simulation.object.heldBy === "right-tool"
        ? leftTip
        : null;

    const inDangerZone =
      pointInBox(leftTip, BOARD_EDGE_ZONE) ||
      pointInBox(rightTip, BOARD_EDGE_ZONE) ||
      (heldTool !== null && pointInBox(peg, BOARD_EDGE_ZONE));
    if (inDangerZone) {
      if (!this.wasInDangerZone) this.dangerZoneCount++;
      this.dangerZoneDurationMs += stepMs;
    }
    this.wasInDangerZone = inDangerZone;

    const corridorPoint = heldTool ? peg : pointDistance(leftTip, PEG_HOME) <= pointDistance(rightTip, PEG_HOME) ? leftTip : rightTip;
    const corridorDeviation = pegCorridorDeviation(corridorPoint);
    let segmentIndex = this.snapshot.segmentIndex;
    let segmentMeta = this.segmentMeta(segmentIndex);
    const inCorridorSegment = segmentMeta.id === "lift" || segmentMeta.id === "transfer" || segmentMeta.id === "place";
    if (inCorridorSegment && heldTool && corridorDeviation > PEG_TRANSFER_THRESHOLDS.corridorToleranceUnits) {
      this.sustainedDeviationMs += stepMs;
      if (this.mode === "practice" && this.sustainedDeviationMs >= PEG_TRANSFER_THRESHOLDS.sustainedDeviationMs && this.manualGhost === null) {
        this.autoGhost = true;
      }
    } else {
      this.sustainedDeviationMs = 0;
    }
    const modeHooks = buildModeHooks(this.mode, this.manualGhost, this.autoGhost);

    let segmentProgress = this.snapshot.segmentProgress;
    let activeTargetId: string | null = this.snapshot.activeTargetId;
    let pegDropped = false;
    let liveInstruction = segmentMeta.instructions;
    let shouldAdvance = false;
    const nearestTipDist = Math.min(pointDistance(leftTip, peg), pointDistance(rightTip, peg));
    const distSource = pointDistance(peg, SOURCE_POST.position);
    const distTransfer = pointDistance(peg, TRANSFER_ZONE.position);
    const distTarget = pointDistance(peg, TARGET_POST.position);
    const lifted = peg.y >= pegLiftHeight();
    const assistMet = simulation.singleHand || (otherTip !== null && pointDistance(otherTip, peg) <= PEG_TRANSFER_THRESHOLDS.assistMeetRadius);

    if (segmentMeta.id === "reach") {
      activeTargetId = PEG_ID;
      const hadReachFrame = (this.segmentFrames.get("reach") ?? 0) > 0;
      segmentProgress = clamp(1 - Math.max(0, nearestTipDist - PEG_TRANSFER_THRESHOLDS.reachRadius) / 0.45, 0, 1);
      liveInstruction = "Move an open instrument tip to the peg on the left post.";
      shouldAdvance = !inDangerZone && hadReachFrame && nearestTipDist <= PEG_TRANSFER_THRESHOLDS.reachRadius;
    } else if (segmentMeta.id === "grasp") {
      activeTargetId = heldTool ? SOURCE_POST.id : PEG_ID;
      if (!heldTool) {
        segmentProgress = nearestTipDist <= PEG_TRANSFER_THRESHOLDS.graspRadius ? 0.45 : 0.15;
        liveInstruction = "Pinch to grasp the peg on the left post. Reaching the right post does not skip the grasp.";
      } else {
        segmentProgress = distSource <= PEG_TRANSFER_THRESHOLDS.graspRadius ? 0.9 : 0.4;
        liveInstruction = "Peg held — keep it over the left post to finish the grasp.";
        shouldAdvance = !inDangerZone && distSource <= PEG_TRANSFER_THRESHOLDS.graspRadius;
        if (shouldAdvance && !this.completedTargets.includes(SOURCE_POST.id)) {
          this.completedTargets = [...this.completedTargets, SOURCE_POST.id];
        }
      }
    } else if (segmentMeta.id === "lift") {
      activeTargetId = SOURCE_POST.id;
      if (!heldTool) {
        pegDropped = true;
        activeTargetId = PEG_ID;
        liveInstruction = "Peg released early — pick it up again to continue Lift.";
      } else {
        segmentProgress = clamp((peg.y - SOURCE_POST.position.y) / PEG_TRANSFER_THRESHOLDS.liftClearance, 0, 1);
        liveInstruction = lifted
          ? "Peg is clear of the left post. Carry it to the midline."
          : "Lift the peg straight up off the left post before crossing the board.";
        shouldAdvance = !inDangerZone && lifted;
      }
    } else if (segmentMeta.id === "transfer") {
      activeTargetId = TRANSFER_ZONE.id;
      if (!heldTool) {
        pegDropped = true;
        activeTargetId = PEG_ID;
        liveInstruction = "Peg released early — pick it up again and meet at the midline.";
      } else {
        const meetScore = assistMet ? 1 : 0.35;
        segmentProgress = 0.5 * clamp(1 - Math.max(0, distTransfer - PEG_TRANSFER_THRESHOLDS.transferRadius) / 0.28, 0, 1) + 0.5 * meetScore;
        liveInstruction = distTransfer > PEG_TRANSFER_THRESHOLDS.transferRadius
          ? "Carry the peg through the midline ring. The right post does not count yet."
          : assistMet
            ? "Both instruments are at the midline. Continue to the right post."
            : "Bring the other instrument tip to the peg at the midline.";
        shouldAdvance = !inDangerZone && distTransfer <= PEG_TRANSFER_THRESHOLDS.transferRadius && assistMet;
        if (shouldAdvance && !this.completedTargets.includes(TRANSFER_ZONE.id)) {
          this.completedTargets = [...this.completedTargets, TRANSFER_ZONE.id];
        }
      }
    } else if (segmentMeta.id === "place") {
      activeTargetId = TARGET_POST.id;
      if (!heldTool) {
        pegDropped = true;
        activeTargetId = PEG_ID;
        liveInstruction = "Peg released early — pick it up and lower it onto the right post.";
      } else {
        const lowEnough = peg.y <= TARGET_POST.position.y + PEG_TRANSFER_THRESHOLDS.placeHeightSlack;
        segmentProgress = 0.5 * clamp(1 - Math.max(0, distTarget - PEG_TRANSFER_THRESHOLDS.placeRadius) / 0.25, 0, 1)
          + 0.5 * (lowEnough ? 1 : clamp(1 - (peg.y - TARGET_POST.position.y) / 0.2, 0, 0.8));
        liveInstruction = lowEnough && distTarget <= PEG_TRANSFER_THRESHOLDS.placeRadius
          ? "Peg is on the right post. Open your pinch to release it."
          : "Lower the peg onto the right post. Releasing in the air does not place it.";
        shouldAdvance = !inDangerZone && distTarget <= PEG_TRANSFER_THRESHOLDS.placeRadius && lowEnough;
        if (shouldAdvance && !this.completedTargets.includes(TARGET_POST.id)) {
          this.completedTargets = [...this.completedTargets, TARGET_POST.id];
        }
      }
    } else if (segmentMeta.id === "release") {
      activeTargetId = TARGET_POST.id;
      const onPost = distTarget <= PEG_TRANSFER_THRESHOLDS.placeRadius + 0.01
        && peg.y <= TARGET_POST.position.y + PEG_TRANSFER_THRESHOLDS.placeHeightSlack + 0.02;
      if (heldTool) {
        segmentProgress = onPost ? 0.7 : 0.25;
        liveInstruction = onPost
          ? "Open your thumb and index finger to release the peg on the right post."
          : "Move the peg back onto the right post before opening your hand.";
      } else if (onPost && !inDangerZone) {
        segmentProgress = 1;
        shouldAdvance = true;
      } else {
        pegDropped = true;
        activeTargetId = PEG_ID;
        segmentProgress = 0.2;
        liveInstruction = "Peg released off the right post — pick it up and release it on the post.";
      }
    }

    if (inDangerZone) {
      liveInstruction = "Danger zone: lift both instruments off the board edge.";
      shouldAdvance = false;
    }

    const hadSegmentFrame = (this.segmentFrames.get(segmentMeta.id) ?? 0) > 0;
    if (shouldAdvance && !hadSegmentFrame) {
      this.recordFrame(segmentMeta.id, this.computeOverallProgress(segmentIndex, 0.9), simulation, controls);
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
          orientationErrorDeg: 0,
          rotationDeltaDeg: 0,
          inDangerZone: false,
          activeDangerZoneIds: [],
          dangerZoneCount: this.dangerZoneCount,
          dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
          needleDropped: false,
          elapsedActiveMs: Math.round(this.elapsedActiveMs),
          demonstrationProgress: 1,
          modeHooks,
          readyForEvaluation: true,
          readyForReplay: !this.recordingTruncated,
          frameCount: this.frames.length,
          sourceTMs: source,
          canProgress: true,
          message: this.formatMessage(segmentMeta.title, segmentMeta.instructions),
        };
        return this.snapshot;
      }
      segmentProgress = 0.1;
      liveInstruction = segmentMeta.instructions;
      if (segmentMeta.id === "grasp") activeTargetId = heldTool ? SOURCE_POST.id : PEG_ID;
      else if (segmentMeta.id === "lift") activeTargetId = SOURCE_POST.id;
      else if (segmentMeta.id === "transfer") activeTargetId = TRANSFER_ZONE.id;
      else if (segmentMeta.id === "place" || segmentMeta.id === "release") activeTargetId = TARGET_POST.id;
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
      orientationErrorDeg: 0,
      rotationDeltaDeg: 0,
      inDangerZone,
      activeDangerZoneIds: inDangerZone ? [BOARD_EDGE_ZONE.id] : [],
      dangerZoneCount: this.dangerZoneCount,
      dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
      needleDropped: pegDropped,
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

  private updateRouteTask(
    controls: ControlSnapshot,
    simulation: SimulationSnapshot,
    source: number,
    stepMs: number,
  ): ExerciseSnapshot {
    const task = getRouteTask(this.skill.id);
    if (!task) throw new Error(`Route task is unavailable for ${this.skill.id}.`);
    const heldTool = simulation.object.heldBy === "left-tool"
      ? simulation.left
      : simulation.object.heldBy === "right-tool"
        ? simulation.right
        : null;
    let segmentIndex = this.snapshot.segmentIndex;
    let segmentMeta = this.segmentMeta(segmentIndex);
    const step = stepRouteTask({
      task,
      segmentId: segmentMeta.id,
      hadSegmentFrame: (this.segmentFrames.get(segmentMeta.id) ?? 0) > 0,
      sawRelease: this.routeSawRelease,
      singleHand: simulation.singleHand,
      leftTip: simulation.left!.tipPosition,
      rightTip: simulation.right!.tipPosition,
      objectPosition: simulation.object.position,
      heldBy: simulation.object.heldBy,
    });
    this.routeSawRelease = step.sawRelease;
    if (step.inDangerZone) {
      if (!this.wasInDangerZone) this.dangerZoneCount++;
      this.dangerZoneDurationMs += stepMs;
    }
    this.wasInDangerZone = step.inDangerZone;
    const inCorridorSegment = task.corridorSegments.includes(segmentMeta.id);
    if (inCorridorSegment && (heldTool || task.phases.some(item => item.segmentId === segmentMeta.id && item.kind === "trace")) && step.corridorDeviation > ROUTE_THRESHOLDS.corridorToleranceUnits) {
      this.sustainedDeviationMs += stepMs;
      if (this.mode === "practice" && this.sustainedDeviationMs >= ROUTE_THRESHOLDS.sustainedDeviationMs && this.manualGhost === null) {
        this.autoGhost = true;
      }
    } else {
      this.sustainedDeviationMs = 0;
    }
    const modeHooks = buildModeHooks(this.mode, this.manualGhost, this.autoGhost);
    let segmentProgress = step.segmentProgress;
    let activeTargetId = step.activeTargetId;
    let liveInstruction = step.liveInstruction;
    if (step.shouldAdvance && step.completedTargetId && !this.completedTargets.includes(step.completedTargetId)) {
      this.completedTargets = [...this.completedTargets, step.completedTargetId];
    }

    const hadSegmentFrame = (this.segmentFrames.get(segmentMeta.id) ?? 0) > 0;
    if (step.shouldAdvance && !hadSegmentFrame) {
      this.recordFrame(segmentMeta.id, this.computeOverallProgress(segmentIndex, 0.9), simulation, controls);
      this.elapsedActiveMs += 1;
    }

    if (step.shouldAdvance) {
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
      this.routeSawRelease = false;
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
          corridorDeviation: step.corridorDeviation,
          orientationErrorDeg: 0,
          rotationDeltaDeg: 0,
          inDangerZone: false,
          activeDangerZoneIds: [],
          dangerZoneCount: this.dangerZoneCount,
          dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
          needleDropped: false,
          elapsedActiveMs: Math.round(this.elapsedActiveMs),
          demonstrationProgress: 1,
          modeHooks,
          readyForEvaluation: true,
          readyForReplay: !this.recordingTruncated,
          frameCount: this.frames.length,
          sourceTMs: source,
          canProgress: true,
          message: this.formatMessage(segmentMeta.title, segmentMeta.instructions),
        };
        return this.snapshot;
      }
      segmentProgress = 0.1;
      liveInstruction = segmentMeta.instructions;
      const nextPhase = task.phases.find(item => item.segmentId === segmentMeta.id);
      activeTargetId = nextPhase?.kind === "reach" || nextPhase?.kind === "trace" ? nextPhase.targetId : simulation.object.heldBy ? nextPhase?.targetId ?? task.objectId : task.objectId;
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
      corridorDeviation: step.corridorDeviation,
      orientationErrorDeg: 0,
      rotationDeltaDeg: 0,
      inDangerZone: step.inDangerZone,
      activeDangerZoneIds: step.inDangerZone ? [task.danger.id] : [],
      dangerZoneCount: this.dangerZoneCount,
      dangerZoneDurationMs: Math.round(this.dangerZoneDurationMs),
      needleDropped: step.dropped,
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
