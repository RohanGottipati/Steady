"use client";

import type { CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import type { CategoryScores, PerformanceMetricId } from "@/types";

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  precision: "Precision",
  control: "Control",
  technique: "Technique",
  coordination: "Coordination",
  efficiencySafety: "Efficiency & Safety",
};

const METRIC_LABELS: Record<PerformanceMetricId, string> = {
  pathSimilarity: "Path Similarity",
  targetAccuracy: "Target Accuracy",
  depthConsistency: "Depth Consistency",
  instrumentOrientationAccuracy: "Instrument Orientation Accuracy",
  movementSmoothness: "Movement Smoothness",
  pathEfficiency: "Path Efficiency",
  motionStability: "Motion Stability",
  overshootControl: "Overshoot Control",
  correctionEfficiency: "Correction Efficiency",
  rotationControlAccuracy: "Rotation Control Accuracy",
  pinchStability: "Pinch Stability",
  gripTiming: "Grip Timing",
  handWorkspaceControl: "Hand Workspace Control",
  bimanualCoordination: "Bimanual Coordination",
  segmentTiming: "Segment Timing",
  speedProfileControl: "Speed Profile Control",
  idleTimeControl: "Idle Time Control",
  toolCollisionAvoidance: "Tool Collision Avoidance",
  dangerZoneAvoidance: "Danger Zone Avoidance",
  proceduralSequencing: "Procedural Sequencing",
};

function formatMetricName(id: string): string {
  return METRIC_LABELS[id as PerformanceMetricId] ?? id;
}

function scoreToneClass(score: number): string {
  if (score >= 80) {
    return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (score >= 60) {
    return "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
}

export function AttemptResultsPanel({
  bundle,
  onTryAgain,
  saveStatus,
}: {
  bundle: CompletedAttemptBundle;
  onTryAgain: () => void;
  saveStatus: "idle" | "saving" | "demo" | "indexeddb" | "memory";
}) {
  const { attemptResult, evaluation, strongestMetric, weakestMetric } = bundle;
  const durationSeconds = Math.max(0.1, attemptResult.durationMs / 1000).toFixed(1);
  const explanationById = new Map(evaluation.explanations.map(item => [item.id, item.text]));

  return (
    <section
      aria-label="Attempt evaluation results"
      data-testid="attempt-results-panel"
      className="space-y-4 rounded-xl border border-emerald-500/60 bg-white p-5 shadow-sm dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
            {saveStatus === "demo" ? "Demo Complete" : "Attempt Complete"} · Deterministic Kinematic Evaluation
          </p>
          <h3 className="mt-0.5 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Performance Summary
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Mode: <span className="capitalize">{attemptResult.mode}</span> · Duration: {durationSeconds}s · Reference: Synthetic scene guide
          </p>
        </div>
        <button
          type="button"
          data-testid="try-again-button"
          onClick={onTryAgain}
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Try again
        </button>
      </div>

      <p data-testid="attempt-save-status" className="text-xs text-zinc-500" aria-live="polite">
        {saveStatus === "demo" ? "Demonstration results — excluded from your saved attempt history."
          : saveStatus === "saving" ? "Saving this attempt on this device…"
          : saveStatus === "indexeddb" ? "Saved on this device. Cloud sync is not connected yet."
          : "Available until you reload. Device storage is unavailable."}
      </p>
      <div className="grid gap-3 sm:grid-cols-6">
        <div
          className={`flex flex-col justify-between rounded-lg border p-3.5 sm:col-span-2 ${scoreToneClass(attemptResult.overallScore)}`}
        >
          <span className="text-xs font-semibold uppercase opacity-80">Overall Score</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span data-testid="overall-score" className="text-4xl font-bold tracking-tight">
              {attemptResult.overallScore}
            </span>
            <span className="text-sm opacity-75">/ 100</span>
          </div>
          <span className="mt-1 text-xs opacity-80">
            Weighted across 20 deterministic motion metrics
          </span>
        </div>

        <div
          data-testid="category-scores"
          className="grid grid-cols-2 gap-2 sm:col-span-4 sm:grid-cols-5"
        >
          {(Object.keys(CATEGORY_LABELS) as Array<keyof CategoryScores>).map(category => {
            const score = attemptResult.categoryScores[category];
            return (
              <div
                key={category}
                data-testid={`category-${category}`}
                className="flex flex-col justify-between rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
              >
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          data-testid="strongest-metric"
          className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/25"
        >
          <p className="text-xs font-semibold text-emerald-800 uppercase dark:text-emerald-300">
            Strongest Metric
          </p>
          <p className="mt-0.5 font-semibold text-zinc-950 dark:text-zinc-50">
            {formatMetricName(strongestMetric.id)} ({strongestMetric.score}/100)
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {strongestMetric.explanation}
          </p>
        </div>

        <div
          data-testid="weakest-metric"
          className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/25"
        >
          <p className="text-xs font-semibold text-amber-800 uppercase dark:text-amber-300">
            {weakestMetric.score === 100 ? "All metrics at reference level" : "Primary Improvement Area"}
          </p>
          <p className="mt-0.5 font-semibold text-zinc-950 dark:text-zinc-50">
            {formatMetricName(weakestMetric.id)} ({weakestMetric.score}/100)
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {weakestMetric.explanation}
          </p>
        </div>
      </div>

      {attemptResult.worstMoments.length > 0 && (
        <div data-testid="worst-moments" className="space-y-1.5 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            Top Deviation Markers (Replay Evidence)
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-3">
            {attemptResult.worstMoments.map((marker, idx) => (
              <li
                key={`${marker.segmentId}-${marker.tMs}-${idx}`}
                className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="font-semibold capitalize">{marker.segmentId}</span> ·{" "}
                <span className="font-mono">{Math.round(marker.tMs)} ms</span>
                <div className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                  {formatMetricName(marker.metricId)} (severity {Math.round(marker.severity * 100)}%)
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details
        data-testid="all-metrics-details"
        className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800"
      >
        <summary className="cursor-pointer font-semibold text-zinc-800 dark:text-zinc-200">
          All 20 Kinematic Metrics ({evaluation.metrics.length})
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {evaluation.metrics.map(metric => (
            <div
              key={metric.id}
              data-testid={`metric-row-${metric.id}`}
              className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-2.5 py-1.5 dark:border-zinc-800/80"
            >
              <div>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatMetricName(metric.id)}
                </span>
                <p className="font-mono text-[11px] text-zinc-500">
                  {explanationById.get(metric.id as PerformanceMetricId) ?? `${metric.score}/100`}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {metric.score}
              </span>
            </div>
          ))}
        </div>
      </details>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Educational simulation prototype — scores measure kinematic similarity against the reference trajectory and do not represent clinical competence or certification.
      </p>
    </section>
  );
}
