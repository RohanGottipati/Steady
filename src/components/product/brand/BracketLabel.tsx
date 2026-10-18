import React from "react";
import { cn } from "../utils/cn";

/** Mono, bracketed system label — e.g. [ STEADY IS WATCHING ]. */
export function BracketLabel({
  children,
  tone = "light",
  className,
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em]",
        tone === "dark" ? "text-white/60" : "text-muted-foreground",
        className,
      )}
    >
      <span className={tone === "dark" ? "text-scrub-300" : "text-scrub-500"}>
        [
      </span>
      <span>{children}</span>
      <span className={tone === "dark" ? "text-scrub-300" : "text-scrub-500"}>
        ]
      </span>
    </span>
  );
}
