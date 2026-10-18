import React from "react";

/** Circular score indicator with tone-coded stroke. */
export function ScoreRing({
  score,
  size = 112,
  label = "Overall",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#3b8ad8" : "#f59e0b";
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} score ${score} out of 100`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#e3edf3"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink">
          {score}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
