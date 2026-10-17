"use client";

import { useState } from "react";
import { metricLabel as formatMetricName } from "@/lib/evaluation/metric-labels";
import type { CompletedAttemptBundle } from "@/lib/exercise/attempt-evaluator";
import type { CloudSyncResult } from "@/lib/storage/cloud-sync";
import type { AiReview, CategoryScores, ReplayMarker } from "@/types";

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  precision: "Precision",
  control: "Control",
  technique: "Technique",
  coordination: "Coordination",
  efficiencySafety: "Efficiency & Safety",
};

function scoreToneClass(score: number): string {
  if (score >= 80) {
    return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (score >= 60) {
    return "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
}

function saveMessage(
  saveStatus: "idle" | "saving" | "demo" | "indexeddb" | "memory",
  cloudStatus: "idle" | "syncing" | CloudSyncResult,
): string {
  if (saveStatus === "demo") return "Demonstration results — excluded from your saved attempt history.";
  if (saveStatus === "memory") return "Available until you reload. Device storage is unavailable, so this attempt stays in this tab.";
  if (saveStatus === "saving") return "Saving this attempt on this device…";
  if (cloudStatus === "synced") return "Saved on this device and synced to history.";
  if (cloudStatus === "skipped") return "Saved on this device. Cloud sync is off, so this attempt stays local.";
  if (cloudStatus === "local-only") return "Saved on this device. Cloud history is unavailable, so you can keep training and retry sync later.";
  if (cloudStatus === "syncing") return "Saved on this device. Syncing to cloud history…";
  return "Saved on this device. Cloud sync has not finished.";
}

export function AttemptResultsPanel({
  bundle,
  review,
  onTryAgain,
  onReviewMoment,
  saveStatus,
  cloudStatus = "idle",
  onRetrySync,
  reviewSource = "deterministic",
  reviewNotice = null,
}: {
  bundle: CompletedAttemptBundle;
  review: AiReview;
  onTryAgain: () => void;
  /** When provided, worst-moment markers become buttons that open the replay at that issue. */
  onReviewMoment?: (marker: ReplayMarker) => void;
  saveStatus: "idle" | "saving" | "demo" | "indexeddb" | "memory";
  cloudStatus?: "idle" | "syncing" | CloudSyncResult;
  onRetrySync?: () => void;
  reviewSource?: "deterministic" | "model";
  reviewNotice?: string | null;
}) {
  const { attemptResult, evaluation, strongestMetric, weakestMetric } = bundle;
  const durationSeconds = Math.max(0.1, attemptResult.durationMs / 1000).toFixed(1);
  const explanationById = new Map<string, string>(evaluation.explanations.map(item => [item.id, item.text]));
  const [dismissedNote, setDismissedNote] = useState<string | null>(null);
  const noteKey = `${attemptResult.id}:${reviewNotice}`;
  const aiNote = dismissedNote === noteKey ? null : reviewNotice;

  return (
    <section
      aria-label="Attempt evaluation results"
      data-testid="attempt-results-panel"
      className="space-y-4 rounded-xl border border-emerald-500/60 bg-white p-5 shadow-sm dark:bg-zinc-950"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
            {saveStatus === "demo" ? "Sample pass complete" : "Attempt complete"}
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
        {saveMessage(saveStatus, cloudStatus)}
        {cloudStatus === "local-only" && saveStatus === "indexeddb" && onRetrySync && (
          <button type="button" data-testid="retry-cloud-sync" className="ml-2 underline" onClick={onRetrySync}>
            Retry sync
          </button>
        )}
      </p>
      <p data-testid="deterministic-review" className="sr-only">{review.summary}</p>
      {aiNote && (
        <div role="status" data-testid="ai-review-fallback" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>{aiNote}</p>
          <button type="button" data-testid="dismiss-ai-review" className="rounded border border-amber-400 px-2 py-1" onClick={() => setDismissedNote(noteKey)}>Dismiss</button>
        </div>
      )}
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
            Combined from 20 motion measures
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
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
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
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {weakestMetric.explanation}
          </p>
        </div>
      </div>

      <section
        data-testid="ai-review"
        aria-label="Coach review"
        className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3.5 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/25"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wider text-indigo-800 uppercase dark:text-indigo-300">
            Coach Review
          </p>
          <span
            data-testid="ai-review-source"
            className="rounded-full border border-indigo-300 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
          >
            {reviewSource === "model" ? "Model explanation" : "Deterministic summary"}
          </span>
        </div>
        <p data-testid="ai-review-summary" className="text-zinc-800 dark:text-zinc-200">
          {review.summary}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">What went well</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
              {review.strengths.map((item, idx) => (
                <li key={`strength-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Focus next</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
              {review.improvements.map((item, idx) => (
                <li key={`improvement-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {reviewSource === "model" ? "Explains the measured results above. Scores are calculated by the motion evaluator."
            : "Generated from the deterministic metrics above. Available even when the review service is offline."}
        </p>
      </section>

      {attemptResult.worstMoments.length > 0 && (
        <div data-testid="worst-moments" className="space-y-1.5 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            {onReviewMoment ? "Jump to the top issues in replay" : "Top Deviation Markers (Replay Evidence)"}
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-3">
            {attemptResult.worstMoments.map((marker, idx) => {
              const detail = (
                <>
                  <span className="font-semibold capitalize">{marker.segmentId}</span> ·{" "}
                  <span className="font-mono">{Math.round(marker.tMs)} ms</span>
                  <div className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                    {formatMetricName(marker.metricId)} (severity {Math.round(marker.severity * 100)}%)
                  </div>
                </>
              );
              const key = `${marker.segmentId}-${marker.tMs}-${idx}`;
              return onReviewMoment ? (
                <li key={key}>
                  <button
                    type="button"
                    data-testid={`worst-moment-${idx}`}
                    onClick={() => onReviewMoment(marker)}
                    className="w-full rounded border border-zinc-200 bg-zinc-50 p-2 text-left hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                  >
                    <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                      Issue {idx + 1} — review in replay →
                    </span>
                    <div>{detail}</div>
                  </button>
                </li>
              ) : (
                <li
                  key={key}
                  className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {detail}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <details
        data-testid="all-metrics-details"
        className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800"
      >
        <summary className="cursor-pointer font-semibold text-zinc-800 dark:text-zinc-200">
          All 20 measures ({evaluation.metrics.length})
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
                  {explanationById.get(metric.id) ?? `${metric.score}/100`}
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
        Practice score only. It compares this pass with the scene guide and is not a clinical grade.
      </p>
    </section>
  );
}
