"use client";

import { useState } from "react";
import type { TrainingMode } from "@/types/skill";

const MODE_COPY: Record<TrainingMode, { title: string; blurb: string }> = {
  learn: { title: "Learn", blurb: "Ghost visible continuously, step-by-step text coaching." },
  practice: { title: "Practice", blurb: "Ghost on demand, limited coaching." },
  assessment: { title: "Assessment", blurb: "No ghost or live coaching, full evaluation after." },
};

// Controlled on the product route; standalone previews can keep local state.
export function ModeSelector({
  modes,
  value,
  onSelect,
}: {
  modes: readonly TrainingMode[];
  value?: TrainingMode;
  onSelect?: (mode: TrainingMode) => void;
}) {
  const [selected, setSelected] = useState<TrainingMode>(value ?? modes[0] ?? "learn");
  const current = value ?? selected;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {modes.map((mode) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setSelected(mode);
              onSelect?.(mode);
            }}
            className={`rounded-lg border p-4 text-left transition ${
              active
                ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950"
            }`}
          >
            <div className="font-medium text-zinc-950 dark:text-zinc-50">
              {MODE_COPY[mode].title}
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {MODE_COPY[mode].blurb}
            </div>
          </button>
        );
      })}
    </div>
  );
}
