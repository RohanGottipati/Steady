"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { anonymousUserId, retryUnsyncedAttempts } from "@/lib/storage/cloud-sync";
import { clearSavedAttempts } from "@/lib/storage/attempt-cache";
import type { SkillProgress } from "@/lib/db/progress-queries";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; progress: SkillProgress[] }
  | { kind: "unconfigured" }
  | { kind: "error" };

const CATEGORY_LABELS: Record<keyof SkillProgress["avgCategoryScores"], string> = {
  precision: "Precision",
  control: "Control",
  technique: "Technique",
  coordination: "Coordination",
  efficiencySafety: "Efficiency & Safety",
};

async function fetchProgress(): Promise<LoadState> {
  const userId = anonymousUserId();
  // Flush any attempts still queued on this device first. retryUnsyncedAttempts
  // honours NEXT_PUBLIC_ENABLE_CLOUD_SYNC, so a disabled deploy never uploads.
  await retryUnsyncedAttempts({ userId }).catch(() => {});
  try {
    const res = await fetch(`/api/progress?anonymousUserId=${encodeURIComponent(userId)}`);
    if (res.status === 503) return { kind: "unconfigured" };
    if (!res.ok) return { kind: "error" };
    const json = (await res.json()) as { progress: SkillProgress[] };
    return { kind: "ready", progress: json.progress };
  } catch {
    return { kind: "error" };
  }
}

export default function ProgressPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let cancelled = false;
    void fetchProgress().then(next => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    void fetchProgress().then(setState);
  }, []);

  const deleteHistory = useCallback(async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      const userId = anonymousUserId();
      const res = await fetch(`/api/attempts?anonymousUserId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Leave the history on screen and tell the user it did not delete,
        // rather than clearing the view on a silent failure.
        setDeleteError(true);
        return;
      }
      // Drop local copies too, otherwise the next retry would re-upload the
      // just-deleted attempts and resurrect the cloud history.
      await clearSavedAttempts().catch(() => {});
      setState({ kind: "ready", progress: [] });
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  }, []);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your progress</h1>
          <p className="text-sm text-zinc-500">
            Per-skill trends from your saved attempts. Anonymous and device-scoped — no account, no personal data.
          </p>
        </div>
        <Link href="/library" className="rounded-md border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
          ← Back to library
        </Link>
      </div>

      {state.kind === "loading" && <p data-testid="progress-loading" className="text-sm text-zinc-500">Loading your progress…</p>}

      {state.kind === "unconfigured" && (
        <div data-testid="progress-unconfigured" className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/25">
          Cloud sync is not connected in this environment, so cross-session progress is unavailable. Your attempts are
          still saved on this device and visible right after each attempt.
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-lg border border-zinc-300 p-4 text-sm">
          Could not load progress right now.{" "}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && state.progress.length === 0 && (
        <div data-testid="progress-empty" className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          No synced attempts yet. Complete a training attempt and it will appear here.
        </div>
      )}

      {state.kind === "ready" && state.progress.length > 0 && (
        <>
          <ul data-testid="progress-list" className="space-y-4">
            {state.progress.map(skill => (
              <li
                key={skill.skillId}
                data-testid={`progress-skill-${skill.skillId}`}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold capitalize">{skill.skillId.replace(/-/g, " ")}</h2>
                  <span className="text-xs text-zinc-500">{skill.attempts} attempt{skill.attempts === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <Stat label="Best" value={skill.bestScore} />
                  <Stat label="Average" value={skill.avgScore} />
                  <Stat label="Most recent" value={skill.latestScore} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(Object.keys(CATEGORY_LABELS) as Array<keyof SkillProgress["avgCategoryScores"]>).map(category => (
                    <div key={category} className="rounded-lg border border-zinc-100 p-2 text-center dark:border-zinc-800/80">
                      <div className="text-[11px] text-zinc-500">{CATEGORY_LABELS[category]}</div>
                      <div className="text-base font-semibold">{skill.avgCategoryScores[category]}</div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            data-testid="delete-history"
            onClick={() => void deleteHistory()}
            disabled={deleting}
            className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            {deleting ? "Deleting…" : "Delete my attempt history"}
          </button>
          {deleteError && (
            <p data-testid="delete-error" className="text-sm text-red-600 dark:text-red-400">
              Could not delete your history right now. Your attempts are unchanged — please try again.
            </p>
          )}
        </>
      )}

      <p className="text-[11px] text-zinc-500">
        Scores measure kinematic similarity to a reference trajectory in a simulator. They do not represent clinical
        competence, and improvement here does not imply improved patient outcomes.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
