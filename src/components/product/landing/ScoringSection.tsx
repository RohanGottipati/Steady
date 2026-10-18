"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "../Button";
import { cn } from "../utils/cn";
import { BracketLabel } from "../brand/BracketLabel";
import { ScoreRing } from "../training/ScoreRing";
import { SCORE_CATEGORIES } from "../data/landing";
import { scoreTone } from "../utils/scoring";

export function ScoringSection() {
  const { push: navigate } = useRouter();
  const overall = Math.round(
    SCORE_CATEGORIES.reduce((a, c) => a + c.sample, 0) /
      SCORE_CATEGORIES.length,
  );
  return (
    <section className="w-full border-y border-border bg-scrub-50">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <BracketLabel>Motion-level evaluation</BracketLabel>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Scored on motion, not guesswork.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Every attempt is recorded frame by frame and compared to a canonical
            reference. Deterministic scoring means the same motion always earns
            the same score.
          </p>
          <ul className="mt-8 divide-y divide-border border-y border-border">
            {SCORE_CATEGORIES.map((c) => (
              <li
                key={c.label}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  0–100
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border-[1.5px] border-ink bg-white p-7 shadow-[6px_6px_0_0_#0a141c]">
          <div className="flex items-center justify-between">
            <BracketLabel>Sample attempt · Needle passing</BracketLabel>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              Assessment
            </span>
          </div>
          <div className="mt-6 flex items-center gap-6">
            <ScoreRing score={overall} size={124} />
            <div className="text-sm text-muted-foreground">
              <p>
                Duration <span className="font-medium text-ink">0:21</span>
              </p>
              <p>
                Tissue contacts <span className="font-medium text-ink">0</span>
              </p>
              <p>
                Strongest{" "}
                <span className="font-medium text-ink">
                  Efficiency & Safety
                </span>
              </p>
            </div>
          </div>
          <ul className="mt-6 space-y-3">
            {SCORE_CATEGORIES.map((c) => {
              const tone = scoreTone(c.sample);
              return (
                <li key={c.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{c.label}</span>
                    <span
                      className={cn("font-semibold tabular-nums", tone.text)}
                    >
                      {c.sample}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", tone.bar)}
                      style={{ width: `${c.sample}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-7 w-full rounded-full"
            onClick={() => navigate("/train/needle-passing")}
          >
            Take your first attempt{" "}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
