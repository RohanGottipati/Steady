import Link from "next/link";
import type { SkillCatalogEntry } from "@/lib/skills/types";

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "muted" | "accent";
}) {
  const tones = {
    neutral:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    muted:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    accent:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SkillCard({ skill }: { skill: SkillCatalogEntry }) {
  const available = skill.status === "available";

  const body = (
    <div
      className={`flex h-full flex-col gap-4 rounded-xl border p-5 transition ${
        available
          ? "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
          : "border-zinc-200 bg-zinc-50 opacity-80 hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {skill.title}
        </h2>
        {available ? (
          <Badge tone="accent">Available</Badge>
        ) : (
          <Badge tone="muted">Coming soon</Badge>
        )}
      </div>

      <p className="flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {skill.description}
      </p>

      <div className="flex flex-wrap gap-2">
        <Badge>{skill.category}</Badge>
        <Badge>{skill.difficulty}</Badge>
        <Badge>~{skill.estimatedMinutes} min</Badge>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {skill.sourceLabel}
          </span>{" "}
          · {skill.sourceLicense}
        </span>
        <span
          className={
            available
              ? "font-medium text-emerald-700 dark:text-emerald-400"
              : "font-medium text-amber-700 dark:text-amber-400"
          }
        >
          {available ? "Train →" : "Details →"}
        </span>
      </div>
    </div>
  );

  // Every card links to /train/[id]. Coming-soon skills reach a friendly notice
  // there instead of being dead ends on the grid.
  return (
    <Link
      href={`/train/${skill.id}`}
      aria-label={
        available ? `Train ${skill.title}` : `${skill.title} — coming soon`
      }
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
    >
      {body}
    </Link>
  );
}
