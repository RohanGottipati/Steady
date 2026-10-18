import React from "react";
import { cn } from "../utils/cn";

const REST = [
  0.35, 0.55, 0.4, 0.7, 0.45, 0.6, 0.85, 0.5, 0.75, 0.4, 0.65, 0.5, 0.35, 0.55,
  0.4,
];

/** Voice-coach waveform pill. Bars animate while the coach is speaking or listening. */
export function ListeningPill({
  active,
  size = "md",
  className,
}: {
  active: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const bars = size === "sm" ? 9 : 15;
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-ink-800 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)]",
        size === "sm" ? "gap-[3px] px-3 py-2" : "gap-[5px] px-5 py-3",
        className,
      )}
      aria-hidden
    >
      {REST.slice(0, bars).map((h, i) => (
        <span
          key={i}
          className={cn(
            "block rounded-full bg-scrub-100",
            size === "sm" ? "h-3 w-[2px]" : "h-4 w-[3px]",
            active ? "animate-bar" : "opacity-60",
          )}
          style={
            active
              ? {
                  animationDelay: `${(i % 5) * 0.11 + Math.floor(i / 5) * 0.07}s`,
                }
              : { transform: `scaleY(${h})` }
          }
        />
      ))}
    </div>
  );
}
