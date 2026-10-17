import type { CoachingSignals } from "@/lib/coaching/coaching-engine";
import type { SimulationSnapshot } from "@/lib/simulation/tool-simulation";
import type { ExerciseSnapshot } from "./exercise-controller";
import { EXERCISE_THRESHOLDS, NEEDLE_PASSING_RINGS, pointDistance, RELEASE_ZONE } from "./needle-passing-config";
import type { Vec3 } from "@/types";

/** Accepted authoritative samples only; display interpolation is never telemetry. */
export class CoachingSignalsAdapter {
  private previous: { source: number; left: Vec3; right: Vec3 } | null = null;
  private targetId: string | null = null;
  private direction: Vec3 | null = null;
  private maxProjection = 0;
  private correcting = false;

  reset() { this.previous = null; this.targetId = null; this.direction = null; this.maxProjection = 0; this.correcting = false; }

  sample(simulation: SimulationSnapshot, exercise: ExerciseSnapshot): CoachingSignals {
    const left = simulation.left!, right = simulation.right!;
    const source = simulation.sourceTMs!;
    const delta = this.previous ? (source - this.previous.source) / 1000 : 0;
    const fresh = delta > 0 && delta <= 0.12;
    const speed = (side: "left" | "right") => fresh
      ? pointDistance(simulation[side]!.tipPosition, this.previous![side]) / delta : 0;
    const side = simulation.object.heldBy === "right-tool" ? "right"
      : simulation.object.heldBy === "left-tool" ? "left"
      : pointDistance(left.tipPosition, simulation.object.position) <= pointDistance(right.tipPosition, simulation.object.position) ? "left" : "right";
    const target = NEEDLE_PASSING_RINGS.find(ring => ring.id === exercise.activeTargetId)?.position
      ?? (exercise.activeTargetId === "release-zone" ? RELEASE_ZONE.position : simulation.object.position);
    const tip = simulation[side]!.tipPosition;
    if (this.targetId !== exercise.activeTargetId || !fresh) {
      const length = pointDistance(tip, target);
      this.direction = length > 1e-6 ? { x: (target.x - tip.x) / length, y: (target.y - tip.y) / length, z: (target.z - tip.z) / length } : null;
      this.maxProjection = 0; this.correcting = false;
    }
    this.targetId = exercise.activeTargetId;
    // Signed distance along the original approach axis: positive means the tip
    // crossed the target plane. Require a measurable reversal after crossing.
    const projection = this.direction ? (tip.x - target.x) * this.direction.x +
      (tip.y - target.y) * this.direction.y + (tip.z - target.z) * this.direction.z : 0;
    this.maxProjection = Math.max(this.maxProjection, projection);
    if (this.maxProjection > 0.04 && projection < this.maxProjection - 0.01) this.correcting = true;
    if (pointDistance(tip, target) < 0.04) { this.correcting = false; this.maxProjection = 0; }
    const overshoot = this.correcting;
    const toolSpeed = speed(side);
    const assistingHandSpeed = simulation.singleHand ? 0 : speed(side === "left" ? "right" : "left");
    this.previous = { source, left: { ...left.tipPosition }, right: { ...right.tipPosition } };
    return {
      tMs: exercise.elapsedActiveMs,
      active: exercise.phase === "active" && exercise.canProgress,
      segmentId: exercise.segmentId,
      voiceCoachingLevel: exercise.modeHooks.voiceCoachingLevel,
      corridorDeviation: exercise.corridorDeviation,
      inCorridor: simulation.object.heldBy !== null && ["align", "entry", "rotation", "exit"].includes(exercise.segmentId),
      inDangerZone: exercise.inDangerZone,
      toolSpeed,
      assistingHandSpeed,
      gripSlipping: exercise.needleDropped,
      rotationBehindDeg: exercise.segmentId === "rotation"
        ? Math.max(0, EXERCISE_THRESHOLDS.requiredRotationDeltaDeg - exercise.rotationDeltaDeg) : 0,
      overshoot,
    };
  }
}
