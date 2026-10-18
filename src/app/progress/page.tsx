"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { SiteShell } from "@/components/product/layout/SiteShell";
import { BracketLabel } from "@/components/product/brand/BracketLabel";
import { Sparkline } from "@/components/product/progress/Sparkline";
import {
  anonymousUserId,
  retryUnsyncedAttempts,
  deleteAttemptHistory,
} from "@/lib/storage/cloud-sync";
import type { ProgressOverview, SkillProgress } from "@/types/progress";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ProgressOverview }
  | { kind: "unconfigured" }
  | { kind: "error" };
const categories: Record<keyof SkillProgress["avgCategoryScores"], string> = {
  precision: "Precision",
  control: "Control",
  technique: "Technique",
  coordination: "Coordination",
  efficiencySafety: "Efficiency & Safety",
};
async function fetchProgress(signal?: AbortSignal): Promise<LoadState> {
  try {
    const response = await fetch(
      `/api/progress?anonymousUserId=${encodeURIComponent(anonymousUserId())}`,
      {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (response.status === 503) return { kind: "unconfigured" };
    if (!response.ok) return { kind: "error" };
    return { kind: "ready", data: (await response.json()) as ProgressOverview };
  } catch {
    return { kind: "error" };
  }
}
export default function ProgressPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const version = useRef(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const generation = ++version.current;
    void fetchProgress(abort.signal).then((next) => {
      if (!abort.signal.aborted && generation === version.current)
        setState(next);
    });
    void retryUnsyncedAttempts()
      .then(() => fetchProgress(abort.signal))
      .then((next) => {
        if (!abort.signal.aborted && generation === version.current)
          setState(next);
      });
    return () => abort.abort();
  }, []);
  const retry = useCallback(async () => {
    const generation = ++version.current;
    setState({ kind: "loading" });
    const next = await fetchProgress();
    if (generation === version.current) setState(next);
  }, []);
  const remove = async () => {
    ++version.current;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAttemptHistory();
      setState({
        kind: "ready",
        data: {
          progress: [],
          summary: { attempts: 0, bestScore: null, avgScore: null },
        },
      });
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete your history. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };
  return (
    <SiteShell>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-6 py-12"
      >
        <Link href="/library" className="text-sm text-muted-foreground">
          ← Back to library
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <BracketLabel>Anonymous · device-scoped</BracketLabel>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Your progress
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Per-skill trends from your synced attempts. No account required.
            </p>
          </div>
          {state.kind === "ready" &&
            (state.data.summary.attempts > 0 || deleteError) && (
              <button
                type="button"
                data-testid="delete-history"
                disabled={deleting}
                onClick={() => void remove()}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-5 py-2 text-sm text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {deleting ? "Deleting…" : "Delete my attempt history"}
              </button>
            )}
        </div>
        {deleteError && (
          <p
            role="alert"
            data-testid="delete-error"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {deleteError}
          </p>
        )}
        {state.kind === "loading" && (
          <p
            data-testid="progress-loading"
            className="mt-10 text-sm text-muted-foreground"
            role="status"
          >
            Loading your progress…
          </p>
        )}
        {state.kind === "unconfigured" && (
          <p
            data-testid="progress-unconfigured"
            className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900"
          >
            Cloud progress is unavailable in this environment. Attempts can
            still be saved on this device and reviewed immediately after
            training.{" "}
            <button onClick={() => void retry()} className="ml-2 underline">
              Retry
            </button>
          </p>
        )}
        {state.kind === "error" && (
          <p
            role="alert"
            className="mt-10 rounded-2xl border bg-white p-6 text-sm"
          >
            Could not load progress right now.{" "}
            <button onClick={() => void retry()} className="underline">
              Retry
            </button>
          </p>
        )}
        {state.kind === "ready" && (
          <>
            <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {[
                { label: "Attempts", value: state.data.summary.attempts },
                { label: "Best score", value: state.data.summary.bestScore },
                { label: "Average", value: state.data.summary.avgScore },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border bg-white px-4 py-3"
                >
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {stat.value ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {state.data.progress.length === 0 ? (
              <div
                data-testid="progress-empty"
                className="mt-10 rounded-2xl border border-dashed border-ink/30 bg-white p-10 text-center"
              >
                <h2 className="font-medium">No synced attempts yet.</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Complete a training attempt and it will appear here after
                  syncing.
                </p>
                <Link
                  href="/library"
                  className="mt-5 inline-block rounded-full bg-ink px-5 py-2 text-sm text-white"
                >
                  Choose a skill
                </Link>
              </div>
            ) : (
              <ul
                data-testid="progress-list"
                className="mt-10 grid gap-6 lg:grid-cols-2"
              >
                {state.data.progress.map((skill) => (
                  <ProgressCard key={skill.skillId} skill={skill} />
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-10 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Scores measure motion similarity to a reference in a simulator. They
          do not measure clinical competence or predict patient outcomes.
        </p>
      </main>
    </SiteShell>
  );
}
function ProgressCard({ skill }: { skill: SkillProgress }) {
  const values = skill.trend.map((point) => point.overallScore);
  const delta =
    values.length > 1 ? Math.round(values.at(-1)! - values[0]) : null;
  return (
    <li
      data-testid={`progress-skill-${skill.skillId}`}
      className="rounded-2xl border-[1.5px] border-ink bg-white p-6 shadow-[4px_4px_0_0_#0a141c]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold capitalize">
            {skill.skillId.replace(/-/g, " ")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {skill.attempts} attempts · last{" "}
            {new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
            }).format(new Date(skill.latestAt))}
          </p>
        </div>
        {delta !== null && (
          <span className="rounded-full bg-scrub-100 px-3 py-1 text-xs">
            {delta > 0 ? "+" : ""}
            {delta} over recent attempts
          </span>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: "Best", value: skill.bestScore },
          { label: "Average", value: skill.avgScore },
          { label: "Most recent", value: skill.latestScore },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-scrub-50 px-3 py-2.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <Sparkline values={values} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Latest {values.length} synced attempts · oldest to newest
        </p>
      </div>
      <h3 className="mt-5 text-xs font-medium text-muted-foreground">
        Average category scores · all synced attempts
      </h3>
      <ul className="mt-3 space-y-3">
        {(Object.keys(categories) as Array<keyof typeof categories>).map(
          (category) => (
            <li
              key={category}
              className="grid grid-cols-[130px_1fr_28px] items-center gap-3 text-xs"
            >
              <span className="text-muted-foreground">
                {categories[category]}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-scrub-400"
                  style={{ width: `${skill.avgCategoryScores[category]}%` }}
                />
              </span>
              <span className="text-right tabular-nums">
                {skill.avgCategoryScores[category]}
              </span>
            </li>
          ),
        )}
      </ul>
    </li>
  );
}
