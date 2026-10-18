import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Link2,
  Lock,
  Move,
  Scissors,
  Waypoints,
} from "lucide-react";
import { Button } from "../Button";
import { cn } from "../utils/cn";
import { Badge } from "../Badge";
import type { Skill } from "../types/training";

const ICONS: Record<string, typeof Scissors> = {
  "needle-passing": Waypoints,
  suturing: Scissors,
  "knot-tying": Link2,
  "peg-transfer": Move,
};

/** Skill card with bold ink outline (echoing the instrument line-art brand). */
export function SkillCard({
  skill,
  compact = false,
}: {
  skill: Skill;
  compact?: boolean;
}) {
  const Icon = ICONS[skill.id] ?? Waypoints;
  const available = skill.status === "available";
  return (
    <article
      className={cn(
        "group flex h-full flex-col rounded-2xl border-[1.5px] bg-white p-5 transition-all",
        available
          ? "border-ink shadow-[4px_4px_0_0_#0a141c] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#0a141c]"
          : "border-dashed border-ink/40",
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl border-[1.5px]",
            available ? "border-ink bg-scrub-100" : "border-ink/30 bg-muted",
          )}
        >
          <Icon
            className={cn("h-6 w-6", available ? "text-ink" : "text-ink/40")}
            aria-hidden
          />
        </span>
        {available ? (
          <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Ready to train
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full">
            <Lock className="mr-1 h-3 w-3" aria-hidden /> Coming soon
          </Badge>
        )}
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">
        {skill.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {skill.description}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{skill.level}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {skill.minutes} min
        </span>
        <span aria-hidden>·</span>
        <span>{skill.category}</span>
      </div>
      {!compact && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skill.segments.slice(0, 5).map((s, i) => (
            <span
              key={s.id}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {i + 1}. {s.title}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">{skill.source}</p>
      <div className="mt-auto pt-5">
        <Button
          variant={available ? "default" : "outline"}
          className="w-full rounded-full"
          asChild
        >
          <Link
            href={`/train/${skill.id}`}
            aria-label={
              available
                ? `Train ${skill.title}`
                : `${skill.title} — coming soon`
            }
          >
            {available ? "Start training" : "Preview blueprint"}
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </Button>
      </div>
    </article>
  );
}
